/**
 * モデル比較の実測スクリプト。
 *
 * 実際の生成プロンプト（buildGenerationPrompt）を候補モデルに投げ、
 * 応答文・消費ニューロン・所要時間を記録する。結果は model-results/ に保存する。
 *
 * 使い方:
 *   CF_ACCOUNT=<account id> CF_TOKEN=<token> bun scripts/model-compare.ts
 * （CF_TOKEN は wrangler の OAuth トークン。~/Library/Preferences/.wrangler/config/default.toml）
 *
 * モデルの追加・除外は MODELS 配列を編集する。1モデルにつき1回の生成
 * （20件リクエスト）を投げる。投げるたびニューロンを消費するので注意。
 */
import { buildGenerationPrompt } from "../apps/backend/src/generation/prompt";
import { writeFileSync, mkdirSync } from "node:fs";

const account = process.env.CF_ACCOUNT;
const token = process.env.CF_TOKEN;
if (account === undefined || token === undefined) {
  throw new Error("CF_ACCOUNT と CF_TOKEN を環境変数で渡すこと");
}

// テーマはコマンドライン引数で指定する（省略時は「魚」。偏り実測の再現ケース）
const theme = process.argv[2] ?? "魚";
const { system, user } = buildGenerationPrompt({
  kind: "theme",
  name: theme,
  count: 20,
  existing: [],
});
// 第3引数が "hint" のとき、2ラウンド目相当のフィードバックを添える。
// 前回の却下理由を伝えて再生成させる想定の測定
const userFinal =
  process.argv[3] === "hint"
    ? `${user}\n\n前回の20文のうち、多くがテーマの名前で始まっていたため拒否されました。どの文もテーマの名前（とその読み）で書き始めないでください。書き出しは「名物は」「歴史は」「人々は」のように名前以外の語から始めてください。`
    : user;

const MODELS: { id: string; suffix?: string; maxTokens?: number }[] = [
  { id: "@cf/meta/llama-4-scout-17b-16e-instruct" },
];

/** 生成の検証と同じ基準での機械的な適合チェック */
function evaluate(text: string): {
  sentences: string[];
  themeStart: number;
  badChar: number;
  noKanji: number;
  kanaLengths: number[];
} {
  const sentences = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const themeStart = sentences.filter(
    (s) =>
      s.startsWith("魚") || s.startsWith("さかな") || s.startsWith("ぎょ") || s.startsWith("うお"),
  ).length;
  const typable = /^[ぁ-ゖァ-ヺ一-鿿々、。ー！？]+$/u;
  const badChar = sentences.filter((s) => !typable.test(s)).length;
  const noKanji = sentences.filter((s) => !/[一-鿿]/u.test(s)).length;
  const hiragana = (s: string) => [...s].filter((c) => /[ぁ-ゖー]/u.test(c)).length;
  const kanaLengths = sentences.map(hiragana);

  return { sentences, themeStart, badChar, noKanji, kanaLengths };
}

mkdirSync("model-results", { recursive: true });

for (const model of MODELS) {
  const suffix = model.suffix ?? "";
  const messages = [
    { role: "system", content: system },
    { role: "user", content: `${userFinal}\n${suffix}`.trimEnd() },
  ];
  const started = Date.now();
  let result: unknown;
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model.id}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          max_tokens: model.maxTokens ?? 4000,
        }),
      },
    );
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    result = await response.json();
    const data = result as {
      success?: boolean;
      errors?: unknown[];
      result?: {
        response?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { neurons?: number };
      };
    };
    const text = data.result?.response ?? data.result?.choices?.[0]?.message?.content ?? "";
    const neurons = data.result?.usage?.neurons;
    const evaluation = evaluate(text);
    const avgKana =
      evaluation.kanaLengths.length > 0
        ? (
            evaluation.kanaLengths.reduce((a, b) => a + b, 0) / evaluation.kanaLengths.length
          ).toFixed(1)
        : "0";
    console.log(
      [
        model.id,
        `success:${data.success ?? false}`,
        `${elapsed}s`,
        `neurons:${neurons ?? "?"}`,
        `文数:${evaluation.sentences.length}`,
        `文頭テーマ語:${evaluation.themeStart}`,
        `文字種違反:${evaluation.badChar}`,
        `漢字なし:${evaluation.noKanji}`,
        `平均かな字数:${avgKana}`,
        `長すぎ(35打超の目安):${evaluation.kanaLengths.filter((n) => n * 2 + 1 > 35).length}`,
      ].join(" "),
    );
    writeFileSync(
      `model-results/${model.id.replaceAll("/", "_")}-${theme}.json`,
      JSON.stringify({ model: model.id, elapsed, data }, null, 2),
    );
  } catch (error) {
    console.log(`${model.id} ERROR: ${String(error)}`);
  }
}
