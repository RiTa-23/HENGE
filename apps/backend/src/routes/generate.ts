import { normalizeName, PLAY_SIZE, type ThemeKind } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { appendPrompts, insertThemeWithPrompts, recentPromptTexts } from "../db/prompts";
import { findThemeByName, getThemeDetail, setGenerationStatus } from "../db/themes";
import { incrementUsage } from "../db/usage";
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
    // 生成に成功した（テーマ行の挿入まで完了した）ためクォータを1消費する。
    // 加算は挿入の後。逆にすると挿入が失敗したときにクォータだけ減る
    await incrementUsage(db, body.userId);

    return c.json({ theme: await getThemeDetail(db, themeId), created: true });
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
      });

      if (!result.reachedTarget) return fail(c, "GENERATION_FAILED");

      await appendPrompts(db, theme.id, result.valid, model);
      // 生成できることが実証されたので「生成困難」の印を外す
      if (theme.generationStatus === "difficult") await setGenerationStatus(db, theme.id, "ok");
      // 生成に成功したためクォータを1消費する（appendの後。逆順だと失敗時にクォータだけ減る）
      await incrementUsage(db, body.userId);

      return c.json({ theme: await getThemeDetail(db, theme.id), added: result.valid.length });
    } finally {
      await releaseThemeLock(c.env.KV, body.themeId);
    }
  });
