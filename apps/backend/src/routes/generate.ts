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
import { loadGenerationVocabulary } from "../db/vocabularies";
import { acceptsPartialBatch, generateBatch } from "../generation/batch";
import { AiQuotaExceededError, AiUnavailableError } from "../generation/ai";
import { resolveModel } from "../generation/model";
import { createModerateOutputs, moderate, resolveModerationModel } from "../generation/moderation";
import { existingContextSize } from "../generation/prompt";
import { CONSTRAINT_VOCABULARY_MIN, vocabularyFor } from "../generation/vocabulary";
import { fail, failWithUsage } from "../http/error";
import { cacheThemeId, getCachedThemeId } from "../kv/themes";
import { acquireThemeLock, releaseThemeLock } from "../kv/lock";
import { createGetReadings } from "../reading/index";

interface CreateBody {
  kind: ThemeKind;
  name: string;
  userId: string;
  /**
   * 最適化の既定の運指。Next.js 側で音と照らして検証し、標準運指と同じなら外してある。
   * **既存と一致したときは使わない**（最初に作った人の運指のまま）
   */
  defaultFingering?: unknown;
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
 *
 * 例外の前に判定や1ラウンド目で消費していることがあるので、その回の消費も載せる
 */
function failFromAiError(c: Context, error: unknown, neuronsUsed: number) {
  if (error instanceof AiQuotaExceededError) {
    return failWithUsage(c, "AI_QUOTA_EXCEEDED", neuronsUsed);
  }
  if (error instanceof AiUnavailableError) return failWithUsage(c, "AI_UNAVAILABLE", neuronsUsed);
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

    // **最適化は、語彙が足りなければ AI を呼ぶ前に断る**（ニューロンを消費しない）。
    // 渡せる語が少ないと、同じ語ばかりのお題になるか、モデルが語を作り始める
    const vocabulary = body.kind === "constraint" ? vocabularyFor(body.name) : undefined;
    if (vocabulary !== undefined && vocabulary.length < CONSTRAINT_VOCABULARY_MIN) {
      return fail(
        c,
        "GENERATION_FAILED",
        `「${body.name}」を含む語彙が足りず、お題を作れません。別の音を指定してください`,
      );
    }

    const themeId = crypto.randomUUID();
    const model = resolveModel(c.env.GENERATION_MODEL);
    // 応答に載せる合計（成功でも、AIを呼んだあとのエラーでも載せる）。
    // 記録そのものは呼び出しごとに済ませる（onNeurons）
    let neurons = 0;
    // **消費が確定した直後に記録する。** ここより後で何が起きても
    // （判定で弾いた、生成失敗、保存の失敗、クライアント切断によるキャンセル）記録は残る。
    // AIを一度も呼んでいない経路（既存テーマにヒット、語彙不足）では呼ばれない
    const onNeurons = async (used: number) => {
      neurons += used;
      await recordUsage(db, body.userId, used);
    };

    // **名前を判断モデルで判定してから生成する。** NG 語リストは Next.js の入口で当ててある。
    // 弾いたら生成しない（判定の分だけ消費する）。判定できなかったときも通さない
    // （`AI_UNAVAILABLE` で再試行を案内する）。既存と一致した名前は上で返しているので判定しない
    try {
      const { allowed } = await moderate(c.env, {
        model: resolveModerationModel(c.env.MODERATION_MODEL),
        target: { type: "input", kind: body.kind, name: body.name },
        metadata: { themeId, kind: body.kind, round: 0, path: "moderate:input" },
        onNeurons,
      });
      if (allowed[0] !== true) return failWithUsage(c, "INAPPROPRIATE_NAME", neurons);
    } catch (error) {
      return failFromAiError(c, error, neurons);
    }

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
        vocabulary,
        model,
        getReadings: createGetReadings(c.env),
        moderate: createModerateOutputs(c.env, resolveModerationModel(c.env.MODERATION_MODEL)),
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
        onNeurons,
      });
    } catch (error) {
      return failFromAiError(c, error, neurons);
    }

    // **目標未達ならテーマ行を作らない。** 先に作ると、お題ゼロのテーマが
    // 公開一覧に残り、クリックしても何も遊べない状態になる
    if (!result.reachedTarget) return failWithUsage(c, "GENERATION_FAILED", neurons);

    await insertThemeWithPrompts(
      db,
      {
        id: themeId,
        kind: body.kind,
        name: body.name,
        normalizedName,
        createdBy: body.userId,
        // テーマ行の列なので、お題と同じバッチに入る（不変条件5）
        defaultFingeringJson:
          body.kind === "constraint" && body.defaultFingering != null
            ? JSON.stringify(body.defaultFingering)
            : null,
      },
      result.valid,
      model,
      vocabulary,
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

    // **単語・長文はテーマだけ。** 最適化練習（含む文字）・おまかせ・ごちゃまぜには付けない
    // （docs/05-generation.md）。URLを手で書けば `kind=constraint&form=long` の
    // プレイ画面まで辿り着けるので、作る口はここで塞ぐ。長文の指示は指定文字を
    // 入れさせないため、通すと偶然含んだ本だけのプールができる
    if (theme.kind !== "theme" && form !== "sentence") {
      return fail(
        c,
        "VALIDATION_ERROR",
        `${theme.kind === "mix" ? theme.name : "最適化練習"}で作れるのは短文だけです`,
      );
    }

    // 背景補充が走っている最中なら、二重に生成しない。**ロックは形式ごと**
    if (!(await acquireThemeLock(c.env.KV, body.themeId, form))) {
      return fail(c, "GENERATION_IN_PROGRESS");
    }

    // 応答に載せる合計（POST /themes と同じく、エラーでも載せる）
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
        vocabulary: await loadGenerationVocabulary(db, theme),
        model,
        getReadings: createGetReadings(c.env),
        moderate: createModerateOutputs(c.env, resolveModerationModel(c.env.MODERATION_MODEL)),
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
      if (failed) return failWithUsage(c, "GENERATION_FAILED", neurons);

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
      return failFromAiError(c, error, neurons);
    } finally {
      // 記録は onNeurons で済んでいる。ここはロックを返すだけ
      await releaseThemeLock(c.env.KV, body.themeId, form);
    }
  });
