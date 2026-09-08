import { normalizeName, PLAY_SIZE, type ThemeKind } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { appendPrompts, insertThemeWithPrompts, recentPromptTexts } from "../db/prompts";
import { findThemeByName, getThemeDetail, setGenerationStatus } from "../db/themes";
import { addUsage } from "../db/usage";
import { generateBatch } from "../generation/batch";
import { resolveModel } from "../generation/model";
import { EXISTING_CONTEXT_SIZE } from "../generation/prompt";
import { fail } from "../http/error";
import { cacheThemeId, getCachedThemeId } from "../kv/themes";
import { acquireThemeLock, releaseThemeLock } from "../kv/lock";
import { createGetReading } from "../reading/index";

interface CreateBody {
  kind: ThemeKind;
  name: string;
  userId: string;
}

interface RegenerateBody {
  themeId: string;
  userId: string;
}

/**
 * 消費の記録。**失敗しても応答は落とさない。**
 *
 * finally から呼ぶため、ここで投げると生成が成功していても 500 になる。
 * 記録漏れの方が害が小さいので、ログだけ残して先へ進む。
 */
async function recordUsage(db: ReturnType<typeof createDb>, userId: string, neurons: number) {
  try {
    await addUsage(db, userId, neurons);
  } catch (error) {
    console.error("消費の記録に失敗した", { userId, neurons, error });
  }
}

/** 表示名で引いて、見つかれば詳細（お題数つき）を返す */
async function findByNameDetail(db: ReturnType<typeof createDb>, kind: ThemeKind, name: string) {
  const summary = await findThemeByName(db, kind, name);
  return summary === null ? null : await getThemeDetail(db, summary.id);
}

export const generateRoutes = new Hono<{ Bindings: Env }>()
  .post("/themes", async (c) => {
    const body = await c.req.json<CreateBody>();
    const db = createDb(c.env.DB);
    const normalizedName = normalizeName(body.kind, body.name);

    // 既存と一致したらエラーにせず既存を返す。クォータも消費しない
    const cachedId = await getCachedThemeId(c.env.KV, body.kind, normalizedName);
    // キャッシュが古い（指すテーマが消えている）場合は必ずD1で引き直す。
    // ここでフォールバックしないと、同名テーマがD1に残っているときに
    // 新規作成へ進んで一意制約違反になる
    const cached = cachedId === null ? null : await getThemeDetail(db, cachedId);
    const existing = cached ?? (await findByNameDetail(db, body.kind, body.name));
    if (existing !== null) return c.json({ theme: existing, created: false });

    const themeId = crypto.randomUUID();
    const model = resolveModel(c.env.GENERATION_MODEL);
    // AIを呼んだ時点で消費は確定する。成否に関わらず記録するため外に置く
    let neurons = 0;

    try {
      const result = await generateBatch(c.env, {
        kind: body.kind,
        name: body.name,
        themeId,
        path: "create",
        target: PLAY_SIZE,
        existing: [],
        model,
        getReading: createGetReading(c.env),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        onNeurons: (used) => {
          neurons += used;
        },
      });

      // **目標未達ならテーマ行を作らない。** 先に作ると、お題ゼロのテーマが
      // 公開一覧に残り、クリックしても何も遊べない状態になる
      if (!result.reachedTarget) return fail(c, "GENERATION_FAILED");

      await insertThemeWithPrompts(
        db,
        { id: themeId, kind: body.kind, name: body.name, normalizedName, createdBy: body.userId },
        result.valid,
        model,
      );
      await cacheThemeId(c.env.KV, body.kind, normalizedName, themeId);

      return c.json({
        theme: await getThemeDetail(db, themeId),
        created: true,
        neuronsUsed: neurons,
      });
    } finally {
      // **失敗しても記録する。** ニューロンは呼んだ時点でCloudflare側が消費しており、
      // 有効なお題が0件でも戻ってこない。ここで見逃すと、作れないテーマ名を連打
      // したときだけ実コストが台帳に載らない。
      //
      // AIを一度も呼んでいない経路（既存テーマにヒット）は neurons が0のままなので
      // 加算しない。加算は保存の後（finally は return の後に走る）。
      //
      // **記録の失敗で応答を落とさない。** ここで投げると、テーマの作成が
      // 済んでいるのに 500 を返すことになる。記録漏れの方が害が小さい
      // （消費そのものは AI Gateway 側にも残る）。
      if (neurons > 0) await recordUsage(db, body.userId, neurons);
    }
  })
  .post("/prompts/regenerate", async (c) => {
    const body = await c.req.json<RegenerateBody>();
    const db = createDb(c.env.DB);

    const theme = await getThemeDetail(db, body.themeId);
    if (theme === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");

    // 背景補充が走っている最中なら、二重に生成しない
    if (!(await acquireThemeLock(c.env.KV, body.themeId))) {
      return fail(c, "GENERATION_IN_PROGRESS");
    }

    let neurons = 0;

    try {
      const model = resolveModel(c.env.GENERATION_MODEL);
      const result = await generateBatch(c.env, {
        kind: theme.kind,
        name: theme.name,
        themeId: theme.id,
        path: "regenerate",
        target: PLAY_SIZE,
        existing: await recentPromptTexts(db, theme.id, EXISTING_CONTEXT_SIZE),
        model,
        getReading: createGetReading(c.env),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        onNeurons: (used) => {
          neurons += used;
        },
      });

      if (!result.reachedTarget) return fail(c, "GENERATION_FAILED");

      await appendPrompts(db, theme.id, result.valid, model);
      // 生成できることが実証されたので「生成困難」の印を外す
      if (theme.generationStatus === "difficult") await setGenerationStatus(db, theme.id, "ok");

      return c.json({
        theme: await getThemeDetail(db, theme.id),
        added: result.valid.length,
        neuronsUsed: neurons,
      });
    } finally {
      // ロックは先に返す。**記録の失敗でロックを握ったままにしない**
      await releaseThemeLock(c.env.KV, body.themeId);
      // 失敗しても実消費を記録する（ロックが取れず生成しなかった経路は上で return 済み）
      if (neurons > 0) await recordUsage(db, body.userId, neurons);
    }
  });
