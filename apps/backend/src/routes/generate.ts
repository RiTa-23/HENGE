import { normalizeName, playSize, type PromptForm, type ThemeKind } from "@henge/shared";
import { type Context, Hono } from "hono";
import { createDb } from "../db/client";
import { appendPrompts, insertThemeWithPrompts, recentPromptTexts } from "../db/prompts";
import {
  findThemeByName,
  generationStatusOf,
  getThemeDetail,
  setGenerationStatus,
} from "../db/themes";
import { recordUsage } from "../db/usage";
import { generateBatch } from "../generation/batch";
import { AiQuotaExceededError, AiUnavailableError } from "../generation/ai";
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
  /** どちらのプールに作り足すか。省略時は短文 */
  form?: PromptForm;
}

/**
 * Workers AI 側の事情なら、その理由で返す。**テーマ名の問題と混ぜない。**
 *
 * `GENERATION_FAILED`（テーマ名を変えて再試行）に落とすと、名前を変えても
 * 直らない原因に対して打ち直しを促すことになる。翻訳できない例外はそのまま投げる。
 */
function failFromAiError(c: Context, error: unknown) {
  if (error instanceof AiQuotaExceededError) return fail(c, "AI_QUOTA_EXCEEDED");
  if (error instanceof AiUnavailableError) return fail(c, "AI_UNAVAILABLE");
  throw error;
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
    // 応答に載せる合計。記録そのものはラウンドごとに済ませる（onNeurons）
    let neurons = 0;

    let result;
    try {
      result = await generateBatch(c.env, {
        kind: body.kind,
        name: body.name,
        themeId,
        path: "create",
        // 新規作成で作るのは短文のプールだけ（単語は別リクエストで作る）
        target: playSize("sentence"),
        existing: [],
        model,
        getReading: createGetReading(c.env),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        // **消費が確定した直後に記録する。** ここより後で何が起きても
        // （生成失敗、保存の失敗、クライアント切断によるキャンセル）記録は残る。
        // AIを一度も呼んでいない経路（既存テーマにヒット）では呼ばれない
        onNeurons: async (used) => {
          neurons += used;
          await recordUsage(db, body.userId, used);
        },
      });
    } catch (error) {
      return failFromAiError(c, error);
    }

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
  })
  .post("/prompts/regenerate", async (c) => {
    const body = await c.req.json<RegenerateBody>();
    const db = createDb(c.env.DB);

    const theme = await getThemeDetail(db, body.themeId);
    if (theme === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");

    const form: PromptForm = body.form ?? "sentence";

    // 背景補充が走っている最中なら、二重に生成しない。**ロックは形式ごと**
    if (!(await acquireThemeLock(c.env.KV, body.themeId, form))) {
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
        target: playSize(form),
        existing: await recentPromptTexts(db, theme.id, form, EXISTING_CONTEXT_SIZE),
        model,
        getReading: createGetReading(c.env),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        // 消費が確定した直後に記録する（POST /themes と同じ理由）
        onNeurons: async (used) => {
          neurons += used;
          await recordUsage(db, body.userId, used);
        },
      });

      if (!result.reachedTarget) return fail(c, "GENERATION_FAILED");

      await appendPrompts(db, theme.id, form, result.valid, model);
      // 生成できることが実証されたので「生成困難」の印を外す
      if (generationStatusOf(theme, form) === "difficult") {
        await setGenerationStatus(db, theme.id, form, "ok");
      }

      return c.json({
        theme: await getThemeDetail(db, theme.id),
        added: result.valid.length,
        neuronsUsed: neurons,
      });
    } catch (error) {
      return failFromAiError(c, error);
    } finally {
      // 記録は onNeurons で済んでいる。ここはロックを返すだけ
      await releaseThemeLock(c.env.KV, body.themeId, form);
    }
  });
