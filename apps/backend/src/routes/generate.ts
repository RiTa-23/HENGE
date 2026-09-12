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
import { acceptsPartialBatch, generateBatch } from "../generation/batch";
import { AiQuotaExceededError, AiUnavailableError } from "../generation/ai";
import { resolveModel } from "../generation/model";
import { existingContextSize } from "../generation/prompt";
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
        // 新規作成で作るのは短文だけ。単語は別リクエストで作る（不変条件4）
        form: "sentence",
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

    // **単語・長文はテーマだけ。** 最適化練習（含む文字）には付けない
    // （docs/05-generation.md）。URLを手で書けば `kind=constraint&form=long` の
    // プレイ画面まで辿り着けるので、作る口はここで塞ぐ。長文の指示は指定文字を
    // 入れさせないため、通すと偶然含んだ本だけのプールができる
    if (theme.kind === "constraint" && form !== "sentence") {
      return fail(c, "VALIDATION_ERROR", "最適化練習で作れるのは短文だけです");
    }

    // 背景補充が走っている最中なら、二重に生成しない。**ロックは形式ごと**
    if (!(await acquireThemeLock(c.env.KV, body.themeId, form))) {
      return fail(c, "GENERATION_IN_PROGRESS");
    }

    let neurons = 0;

    try {
      const model = resolveModel(c.env.GENERATION_MODEL);

      const result = await generateBatch(c.env, {
        kind: theme.kind,
        form,
        name: theme.name,
        themeId: theme.id,
        path: "regenerate",
        target: playSize(form),
        existing: await recentPromptTexts(db, theme.id, form, existingContextSize(form)),
        model,
        getReading: createGetReading(c.env),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        // 消費が確定した直後に記録する（POST /themes と同じ理由）
        onNeurons: async (used) => {
          neurons += used;
          await recordUsage(db, body.userId, used);
        },
      });

      /**
       * **単語と長文は取れた分を必ず保存する**（`acceptsPartialBatch`）。短文は
       * 目標未達なら1件も保存せず `GENERATION_FAILED` を返すが、目標と1回で作れる
       * 上限が近い形式で同じにすると、少し届かないだけで**有効なお題と消費した
       * ニューロンを捨てて何度も押させる**ことになる。
       *
       * 追加した先はテーマ既存のプールなので、途中まで積むこと自体に害はない
       * （新規作成で「お題ゼロのテーマを作らない」のとは事情が違う）。
       * 1件も作れなかったときだけ失敗として返す。
       */
      const failed = acceptsPartialBatch(form) ? result.valid.length === 0 : !result.reachedTarget;
      if (failed) return fail(c, "GENERATION_FAILED");

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
