/**
 * 【一時的な検証用】お題生成パイプラインを手で叩いて中身を見るためのルート。
 *
 * Phase 4 で POST /themes が入ったら不要になる。コミットしないこと。
 * 実行すると Workers AI のニューロンと Yahoo API の枠を実際に消費する。
 */
/* oxlint-disable no-await-in-loop -- 1件ずつどこで落ちたかを見るための検証用コード */
import {
  countKeystrokes,
  includesConstraint,
  isKeystrokeCountInRange,
  isTypableText,
  type ThemeKind,
  UnsupportedKanaError,
} from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "./db/client";
import { insertThemeWithPrompts, recentPromptTexts } from "./db/prompts";
import { requestPrompts } from "./generation/ai";
import { generateBatch, N_REQUEST } from "./generation/batch";
import { resolveModel } from "./generation/model";
import { buildGenerationPrompt } from "./generation/prompt";
import { createGetReading } from "./reading/index";

export const spike = new Hono<{ Bindings: Env }>();

/** $0.011 / 1,000 neurons（Workers AI の課金単位）。無料枠は 10,000 neurons/日 */
const USD_PER_1K_NEURONS = 0.011;

/**
 * AI Gateway のログから使用量を取る。ログは即時反映ではないため数回リトライする。
 * neurons は cost（USD）から換算した概算。
 */
async function fetchUsage(env: Env, logId: string | undefined) {
  if (logId === undefined) return undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const log = await env.AI.gateway("henge").getLog(logId);
      const neurons = log.cost === undefined ? undefined : (log.cost / USD_PER_1K_NEURONS) * 1000;
      return {
        入力トークン: log.tokens_in,
        出力トークン: log.tokens_out,
        コストUSD: log.cost,
        消費ニューロン概算: neurons === undefined ? undefined : Math.round(neurons * 10) / 10,
        "1日の無料枠に対する割合%":
          neurons === undefined ? undefined : Math.round((neurons / 10_000) * 1000) / 10,
        ゲートウェイ計測の所要時間ms: log.duration,
        キャッシュ: log.cached,
      };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  return { 取得できず: "AI Gatewayのログがまだ反映されていない" };
}

interface Body {
  kind?: ThemeKind;
  name?: string;
  model?: string;
  count?: number;
  save?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
}

/** モデルの生の応答をそのまま返す（パースの問題を切り分けるため） */
spike.post("/spike/raw", async (c) => {
  const body = await c.req.json<Body>();
  const model = resolveModel(body.model);
  const { system, user } = buildGenerationPrompt({
    kind: body.kind ?? "theme",
    name: body.name ?? "忍びの心得",
    count: body.count ?? 5,
    existing: [],
  });
  const run = c.env.AI.run.bind(c.env.AI) as (
    m: string,
    i: unknown,
    o: unknown,
  ) => Promise<unknown>;
  const started = Date.now();
  const raw = (await run(
    model,
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(body.reasoningEffort === undefined ? {} : { reasoning_effort: body.reasoningEffort }),
    },
    { gateway: { id: "henge", skipCache: true } },
  )) as {
    choices?: { message?: { content?: string; reasoning?: string } }[];
    usage?: Record<string, number>;
  };
  return c.json({
    model,
    reasoningEffort: body.reasoningEffort ?? "(未指定)",
    かかった時間ms: Date.now() - started,
    usage: raw.usage,
    推論の文字数: raw.choices?.[0]?.message?.reasoning?.length ?? 0,
    本文: raw.choices?.[0]?.message?.content,
  });
});

/** 1ラウンドだけ生成し、各お題がどの段階で落ちたかを1件ずつ返す */
spike.post("/spike/generate", async (c) => {
  const body = await c.req.json<Body>();
  const kind = body.kind ?? "theme";
  const name = body.name ?? "忍びの心得";
  const model = resolveModel(body.model);
  const getReading = createGetReading(c.env);
  const started = Date.now();

  const { texts, logId } = await requestPrompts(c.env, {
    model,
    kind,
    name,
    count: body.count ?? N_REQUEST,
    existing: [],
    metadata: { themeId: "spike", kind, round: 1, path: "create" },
  });
  const generatedAt = Date.now();

  const results = [];
  for (const text of texts) {
    if (!isTypableText(text)) {
      results.push({ text, verdict: "却下: charset（打てない文字）" });
      continue;
    }
    try {
      const reading = await getReading(text);
      const keystrokes = countKeystrokes(reading.roman);
      if (!isKeystrokeCountInRange(keystrokes)) {
        results.push({
          text,
          kana: reading.kana,
          keystrokes,
          verdict: "却下: keystroke（10〜40の外）",
        });
        continue;
      }
      if (kind === "constraint" && !includesConstraint(reading.kana, name)) {
        results.push({
          text,
          kana: reading.kana,
          keystrokes,
          verdict: `却下: constraint（読みに「${name}」が無い）`,
        });
        continue;
      }
      results.push({ text, kana: reading.kana, keystrokes, verdict: "採用" });
    } catch (error) {
      const reason =
        error instanceof UnsupportedKanaError
          ? `却下: charset（読みに ${error.kana}）`
          : `エラー: ${String(error)}`;
      results.push({ text, verdict: reason });
    }
  }

  return c.json({
    model,
    logId,
    使用量: await fetchUsage(c.env, logId),
    prompt: buildGenerationPrompt({ kind, name, count: body.count ?? N_REQUEST, existing: [] }),
    生成件数: texts.length,
    採用: results.filter((r) => r.verdict === "採用").length,
    生成にかかった時間ms: generatedAt - started,
    読み取得と検証にかかった時間ms: Date.now() - generatedAt,
    results,
  });
});

/** 本番と同じ経路（最大2ラウンド）。save: true でD1にも保存する */
spike.post("/spike/batch", async (c) => {
  const body = await c.req.json<Body>();
  const kind = body.kind ?? "theme";
  const name = body.name ?? "忍びの心得";
  const model = resolveModel(body.model);
  const db = createDb(c.env.DB);
  const themeId = crypto.randomUUID();
  const started = Date.now();

  const result = await generateBatch(c.env, {
    kind,
    name,
    themeId,
    path: "create",
    target: 15,
    existing: await recentPromptTexts(db, themeId, 30),
    model,
    getReading: createGetReading(c.env),
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  if (body.save === true && result.reachedTarget) {
    await insertThemeWithPrompts(
      db,
      { id: themeId, kind, name, normalizedName: name, createdBy: null },
      result.valid,
      model,
    );
  }

  return c.json({
    model,
    themeId,
    ラウンド数: result.rounds,
    目標到達: result.reachedTarget,
    有効件数: result.valid.length,
    却下内訳: result.rejected,
    かかった時間ms: Date.now() - started,
    保存した: body.save === true && result.reachedTarget,
    お題: result.valid.map((v) => ({
      text: v.text,
      kana: v.readingKana,
      打鍵数: v.keystrokeCount,
    })),
  });
});
