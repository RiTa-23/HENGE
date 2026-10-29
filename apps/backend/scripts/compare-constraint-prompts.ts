#!/usr/bin/env bun
/* oxlint-disable no-await-in-loop --
 * 生成は1回ずつ順に回す。並べると Workers AI に一度に投げ、混雑（3040）に当たりやすい。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// 測定のためだけにバックエンドへ依存を足さない（読み Worker 専用のパッケージ）
import { initSync, Reader } from "../../../packages/reading-wasm/pkg/reading_wasm.js";
import {
  buildRomanCandidates,
  countConstraint,
  katakanaToHiragana,
  UnsupportedKanaError,
} from "@henge/shared";
import { getPlatformProxy } from "wrangler";
import { readingOf } from "../../reading/src/reading";
import { generateBatch, type GenerateBatchInput } from "../src/generation/batch";
import { DEFAULT_MODEL } from "../src/generation/model";
import type { WordsPerSentence } from "../src/generation/prompt";
import type { GetReadings, ReadingOutcome } from "../src/reading/types";
import { vocabularyFor } from "../src/generation/vocabulary";

/**
 * 最適化の生成で、1文に渡す語の数（2語の組か、3語から2語以上を選ばせるか）を比べる（#262）。
 *
 * **本番と同じパイプライン（`generateBatch`）を通す。** AI だけを wrangler の
 * `getPlatformProxy()` 経由のリモートの Workers AI に、読み取得だけを読み Worker と同じ辞書
 * （ローカルの Vibrato）に差し替える。プロンプト・検証・却下の内訳は本番と同じものになる。
 * AI Gateway は通さない（本番のログに混ぜない）。
 *
 * 使い方（リポジトリのルートから）:
 *   bun scripts/unidic/fetch-dict.ts            # 読みの辞書（初回だけ）
 *   npx wrangler login                          # Workers AI を呼べるアカウントで（初回だけ）
 *   bun run compare:constraint --chars=ざ,き,で --runs=3
 *   --dry-run を付けると AI を呼ばずに（ログインも不要）、渡した語を並べただけの文で配線を確かめる
 *
 * **Bun では直接動かさない。** wrangler のリモートバインディングは Bun の `fetch()` では動かない
 * （wrangler が明示的に断る）。`compare:constraint` は bun でバンドルし、Node で起動する。
 * --dry-run だけなら `bun apps/backend/scripts/compare-constraint-prompts.ts` でも動く。
 *
 * 1回の生成は最大2ラウンドで、既定モデルなら約13ニューロン。既定（3文字×2案×3回）で
 * 約230ニューロンを使う（アカウント全体の無料枠は1日10,000）。
 *
 * 出力: 画面に案ごとの集計、`--out`（既定 constraint-prompts.md）に全文。**文の自然さは
 * 機械では測れない**ので、全文を読んで比べる。
 */

type Options = {
  chars: string[];
  runs: number;
  variants: WordsPerSentence[];
  out: string;
  dryRun: boolean;
};

function parseArgs(argv: readonly string[]): Options {
  const value = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const runs = Number(value("runs") ?? 3);
  if (!Number.isInteger(runs) || runs <= 0) throw new Error("--runs= には1以上の整数を渡す");
  const variants = (value("variants") ?? "2,3").split(",").map(Number);
  if (!variants.every((v) => v === 2 || v === 3)) throw new Error("--variants= は 2 と 3 だけ");
  return {
    chars: (value("chars") ?? "ざ,き,で").split(","),
    runs,
    variants: variants as WordsPerSentence[],
    out: value("out") ?? "constraint-prompts.md",
    dryRun: argv.includes("--dry-run"),
  };
}

/** 読み Worker と同じ組み立て（apps/reading/src/index.ts）を、ローカルの辞書で行う */
function localReadings(): GetReadings {
  const assets = new URL("../../reading/assets/", import.meta.url);
  initSync({
    module: readFileSync(
      fileURLToPath(
        new URL("../../../packages/reading-wasm/pkg/reading_wasm_bg.wasm", import.meta.url),
      ),
    ),
  });
  const reader = Reader.from_zstd(
    new Uint8Array(readFileSync(fileURLToPath(new URL("unidic.dic.zst", assets)))),
    readFileSync(fileURLToPath(new URL("user-lex.csv", assets)), "utf8"),
  );
  return async (texts) =>
    texts.map((text): ReadingOutcome => {
      const result = readingOf(reader.tokenize(text), katakanaToHiragana);
      if ("error" in result)
        return { ok: false, error: "UNKNOWN_READING", surface: result.surface };
      try {
        return {
          ok: true,
          reading: { kana: result.kana, roman: buildRomanCandidates(result.kana) },
        };
      } catch (error) {
        if (error instanceof UnsupportedKanaError) {
          return { ok: false, error: "UNKNOWN_READING", surface: text };
        }
        throw error;
      }
    });
}

interface Call {
  prompt: string;
  output: string;
}

type AiBody = { messages: { role: string; content: string }[] };
type RemoteRun = (
  model: string,
  body: AiBody,
) => Promise<{ response?: unknown; choices?: { message?: { content?: string } }[] }>;

/**
 * `env.AI` の代わり。ログイン済みの wrangler の認証でリモートの AI バインディングを呼び、
 * 依頼と応答を記録する。**AI Gateway は通さない**（第3引数を捨てる）。本番の Gateway ログに
 * 測定の呼び出しを混ぜないため
 */
function proxiedAi(calls: Call[], remoteRun: RemoteRun | undefined) {
  return {
    aiGatewayLogId: undefined,
    gateway: () => ({ patchLog: async () => {} }),
    async run(model: string, body: AiBody) {
      const prompt = body.messages.find((m) => m.role === "user")?.content ?? "";
      if (remoteRun === undefined) {
        // 語の組をそのまま「〜と〜を見た。」にする。配線の確認用
        const lines = prompt
          .slice(prompt.indexOf("語の組:") + 5)
          .trim()
          .split("\n");
        const output = lines
          .filter((line) => !line.startsWith("/"))
          .map((line) => `${line.split("／").slice(0, 2).join("と")}を見た。`)
          .join("\n");
        calls.push({ prompt, output });
        return { response: output, usage: { prompt_tokens: 0, completion_tokens: 0 } };
      }
      const result = await remoteRun(model, body);
      const output =
        typeof result.response === "string"
          ? result.response
          : (result.choices?.[0]?.message?.content ?? "");
      calls.push({ prompt, output });
      return result;
    },
  };
}

/** 依頼で渡した語の組（1行が1組） */
function groupsOf(call: Call): string[] {
  return call.prompt
    .slice(call.prompt.indexOf("語の組:") + 5)
    .trim()
    .split("\n")
    .filter((line) => !line.startsWith("/"));
}

function outputLines(call: Call): string[] {
  return call.output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/** 渡した語のうち、文の中に現れた割合。活用するので語幹（末尾1文字を落とした形）でも数える */
function usedRatio(prompts: readonly Call[], texts: readonly string[]): number {
  const words = prompts.flatMap((call) => groupsOf(call).flatMap((line) => line.split("／")));
  const all = texts.join("\n");
  const used = words.filter(
    (w) => all.includes(w) || (w.length >= 2 && all.includes(w.slice(0, -1))),
  );
  return words.length === 0 ? 0 : used.length / words.length;
}

function pct(n: number, d: number): string {
  return d === 0 ? "-" : `${Math.round((n / d) * 100)}%`;
}

const options = parseArgs(process.argv.slice(2));
const getReadings = localReadings();
// D1 / KV / 読み Worker のバインディングも立ち上がるが使わない。使うのは AI だけ
const proxy = options.dryRun
  ? undefined
  : await getPlatformProxy<Env>({
      configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
    });
const remoteRun =
  proxy === undefined ? undefined : (proxy.env.AI.run.bind(proxy.env.AI) as unknown as RemoteRun);
const report: string[] = ["# 最適化の生成: 1文に渡す語の数の比較", ""];
const summary: string[] = [];

for (const char of options.chars) {
  const vocabulary = vocabularyFor(char);
  for (const wordsPerSentence of options.variants) {
    const stats = {
      calls: 0,
      // 出力の行数が組の数と違う呼び出し。1語ごとに1文を書くなど、組と文の対応が失われている。
      // **下限でしかない。** 1語ごとに書いても依頼の行数で止まると行数は合う。全文で確かめる
      broken: 0,
      lines: 0,
      reached: 0,
      valid: 0,
      twice: 0,
      startsWith: 0,
      used: 0,
      rejected: {} as Record<string, number>,
    };
    const texts: string[] = [];
    report.push(`## 「${char}」・1文に${wordsPerSentence}語`, "");

    for (let run = 1; run <= options.runs; run++) {
      const calls: Call[] = [];
      const env = { AI: proxiedAi(calls, remoteRun) } as unknown as Env;
      const input: GenerateBatchInput = {
        kind: "constraint",
        form: "sentence",
        name: char,
        themeId: "compare",
        path: "regenerate",
        target: 10,
        existing: [],
        vocabulary,
        wordsPerSentence,
        model: DEFAULT_MODEL,
        getReadings,
        // 生成の指示を比べる測定なので、判断モデルの判定はかけない（すべて通す）
        moderate: async (request) => request.texts.map(() => true),
      };
      const result = await generateBatch(env, input);
      const valid = result.valid.map((p) => p.text);

      // 分母は実際の出力行数。モデルが組の数より多く書くことがあり、依頼数で割ると100%を超える
      stats.calls += calls.length;
      stats.broken += calls.filter((c) => outputLines(c).length !== groupsOf(c).length).length;
      stats.lines += calls.reduce((n, c) => n + outputLines(c).length, 0);
      if (result.reachedTarget) stats.reached += 1;
      stats.valid += valid.length;
      stats.twice += result.valid.filter((p) => countConstraint(p.readingKana, char) >= 2).length;
      stats.startsWith += result.valid.filter((p) => p.readingKana.startsWith(char)).length;
      stats.used += usedRatio(calls, valid) * valid.length;
      for (const [label, count] of Object.entries(result.rejected)) {
        stats.rejected[label] = (stats.rejected[label] ?? 0) + count;
      }
      texts.push(...valid);

      report.push(`### ${run}回目（${result.rounds}ラウンド・採用 ${valid.length}）`, "");
      for (const call of calls) {
        const accepted = new Set(valid);
        report.push("```", call.prompt.slice(call.prompt.indexOf("語の組:")), "```", "");
        for (const line of outputLines(call)) {
          report.push(`- ${accepted.has(line) ? "○" : "×"} ${line}`);
        }
        report.push("");
      }
    }
    summary.push(
      [
        `「${char}」${wordsPerSentence}語`,
        `採用 ${stats.valid}/${stats.lines}行（${pct(stats.valid, stats.lines)}）`,
        `10問に届いた ${stats.reached}/${options.runs}回`,
        `形が崩れた ${stats.broken}/${stats.calls}呼び出し`,
        `2回以上 ${pct(stats.twice, stats.valid)}`,
        `文頭 ${pct(stats.startsWith, stats.valid)}`,
        `渡した語が現れた ${pct(stats.used, stats.valid)}`,
        `却下 ${Object.entries(stats.rejected)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k}:${n}`)
          .join(",")}`,
      ].join("\t"),
    );
  }
}

writeFileSync(
  options.out,
  [...report, "## 集計", "", ...summary.map((s) => `- ${s}`), ""].join("\n"),
);
console.log(summary.join("\n"));
console.log(`全文: ${options.out}`);
await proxy?.dispose();
