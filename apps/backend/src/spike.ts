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

interface Body {
  kind?: ThemeKind;
  name?: string;
  model?: string;
  count?: number;
  save?: boolean;
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
  const raw = await run(
    model,
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    { gateway: { id: "henge", skipCache: true } },
  );
  return c.json({ model, raw });
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
