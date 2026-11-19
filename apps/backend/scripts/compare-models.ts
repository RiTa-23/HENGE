#!/usr/bin/env bun
/* oxlint-disable no-await-in-loop --
 * 生成は1回ずつ順に回す。並べると Workers AI に一度に投げ、混雑（3040）に当たりやすく、
 * 所要時間の比較もできなくなる。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// 測定のためだけにバックエンドへ依存を足さない（読み Worker 専用のパッケージ）
import { initSync, Reader } from "../../../packages/reading-wasm/pkg/reading_wasm.js";
import {
  buildRomanCandidates,
  containsKanji,
  containsNgWord,
  containsReadingProneWord,
  countKeystrokes,
  countSentenceEnds,
  includesConstraint,
  isHiraganaOnlyWord,
  isKeystrokeCountInRange,
  isTypableText,
  isTypableWord,
  katakanaToHiragana,
  LONG_SENTENCE_MIN,
  playSize,
  type PromptForm,
  type ThemeKind,
  UnsupportedKanaError,
} from "@henge/shared";
import { getPlatformProxy } from "wrangler";
import { readingOf } from "../../reading/src/reading";
import { generateBatch } from "../src/generation/batch";
import type { ModelId } from "../src/generation/model";
import { createModerateOutputs, resolveModerationModel } from "../src/generation/moderation";
import { parseGeneratedOutput } from "../src/generation/prompt";
import type { GetReadings, ReadingOutcome } from "../src/reading/types";
import { mixVocabulary, vocabularyFor } from "../src/generation/vocabulary";

/**
 * 生成モデルの比較。候補のモデルを、**本番と同じパイプライン（`generateBatch`）で**測る。
 * `@cf/qwen/qwen3-30b-a3b-fp8` の廃止に伴う移行先選び（#359）のために作った。結果の記録は
 * `docs/benchmarks/2026-11-generation-model.md`。
 *
 * - AI だけを wrangler の `getPlatformProxy()` 経由のリモートの Workers AI に、読み取得だけを
 *   ローカルの辞書（読み Worker と同じ組み立て）に差し替える
 * - **生成お題の判定（Clef-flash）も本番と同じく通す。** 判定の消費は生成とは分けて数える
 *   （どのモデルでも同じ判断モデルなので、モデルの比較には生成の消費だけを使う）
 * - AI Gateway は通さない（本番のログに混ぜない）
 *
 * **モデルごとの追加パラメータ（思考を切る等）はここで本文に足す。** 本番の `MODELS` には
 * まだ本文へ任意の値を足す口が無いため、測定の側で注入する。
 *
 * **ニューロンは応答のトークン数×公式単価で出す。** 単価は Workers AI のカタログ
 * （`wrangler ai models list --json` の price、USD/100万トークン）を 1,000 neurons = $0.011 で
 * 換算した値。本番の `MODELS` と同じ計算方法になる。
 *
 * 使い方（リポジトリのルートから）:
 *   bun run compare:models                                  # 既定の2モデル×全ケース
 *   bun run compare:models --variants=sea-lion,glm47-nothink --cases='theme-sentence:魚*3'
 *   ケースは `kind-form:名前*回数`。kind は theme / constraint / mix
 *   `--variants` の先頭が比べる基準になる（集計の「基準比」）
 *
 * 出力（`--out=` のディレクトリ。既定 model-bench/）:
 *   - texts.csv       モデルが返した全行。採用・却下と却下の理由、読み、打鍵数、渡した語
 *   - generations.csv 1回の生成ごとの秒数・ニューロン・採用数・却下の内訳
 *   - summary.md      モデル×モードの集計
 *
 * **測定で使ったニューロンは本番と同じアカウントの日次枠（10,000）から引かれる。**
 */

const NEURONS_PER_USD = 1000 / 0.011;

interface Variant {
  model: string;
  /** 公式単価（USD / 100万トークン） */
  usd: { input: number; output: number };
  /** 本文に足すパラメータ。思考の制御など */
  extra?: Record<string, unknown>;
  /** 依頼の末尾に足す指示。本番の `promptSuffix` と同じ位置（モデル固有の補正を試す） */
  promptSuffix?: string;
}

/**
 * Workers Free で呼べるテキスト生成モデル（2026-11 時点）。
 * 以前の既定 qwen3-30b（2026-11-20 に廃止）は、呼べないので外した。
 */
const VARIANTS: Record<string, Variant> = {
  // 本番の既定
  "sea-lion": {
    model: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
    usd: { input: 0.351, output: 0.555 },
  },
  "gemma4-nothink": {
    model: "@cf/google/gemma-4-26b-a4b-it",
    usd: { input: 0.1, output: 0.3 },
    extra: { chat_template_kwargs: { enable_thinking: false } },
  },
  // 思考なしだと漢字を使わない文が多い。漢字の指示を末尾で念押しする
  "gemma4-nothink-kanji": {
    model: "@cf/google/gemma-4-26b-a4b-it",
    usd: { input: 0.1, output: 0.3 },
    extra: { chat_template_kwargs: { enable_thinking: false } },
    promptSuffix: "どの文にも漢字を必ず1字以上入れること。ひらがなだけの文は拒否される。",
  },
  // 既定のまま（思考あり）。上限まで思考して本文が空になる（2026-11-08 実測）
  gemma4: { model: "@cf/google/gemma-4-26b-a4b-it", usd: { input: 0.1, output: 0.3 } },
  "glm47-nothink": {
    model: "@cf/zai-org/glm-4.7-flash",
    usd: { input: 0.0605, output: 0.4 },
    extra: { chat_template_kwargs: { enable_thinking: false } },
  },
  // 推論は切れない（mandatory）。最小の low にする
  "gptoss20-low": {
    model: "@cf/openai/gpt-oss-20b",
    usd: { input: 0.2, output: 0.3 },
    extra: { reasoning_effort: "low" },
  },
  scout: { model: "@cf/meta/llama-4-scout-17b-16e-instruct", usd: { input: 0.27, output: 0.85 } },
  "mistral-small": {
    model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    usd: { input: 0.351, output: 0.555 },
  },
  // カタログで最安。3B級なので日本語の書式遵守が持つかを見る
  granite: { model: "@cf/ibm-granite/granite-4.0-h-micro", usd: { input: 0.017, output: 0.112 } },
};

const DEFAULT_VARIANTS = ["sea-lion", "gemma4-nothink"];

interface Case {
  kind: ThemeKind;
  form: PromptForm;
  name: string;
  runs: number;
}

/** 画面の入口ごと。おまかせの単語は AI を使わない（語彙から取り出すだけ）ので測らない */
const DEFAULT_CASES = [
  "mix-sentence:おまかせ*5",
  "mix-sentence:ごちゃまぜ*5",
  "theme-sentence:魚*2",
  "theme-sentence:TypeScript*2",
  "theme-sentence:博多*2",
  "theme-sentence:宇宙*2",
  "theme-sentence:料理*2",
  "theme-sentence:忍者*2",
  "theme-word:魚*1",
  "theme-word:忍びの心得*1",
  "theme-word:TypeScript*1",
  "theme-long:魚*2",
  "theme-long:博多*2",
  "theme-long:宇宙*2",
  "constraint-sentence:ざ*3",
  "constraint-sentence:で*3",
  "constraint-sentence:き*3",
  "constraint-sentence:ひょう*3",
];

function parseCase(spec: string): Case {
  const match = /^(theme|constraint|mix)-(sentence|word|long):(.+?)(?:\*(\d+))?$/u.exec(spec);
  if (match === null) throw new Error(`--cases= の形が違う: ${spec}`);
  return {
    kind: match[1] as ThemeKind,
    form: match[2] as PromptForm,
    name: match[3]!,
    runs: Number(match[4] ?? 1),
  };
}

function parseArgs(argv: readonly string[]) {
  const value = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const variants = value("variants")?.split(",") ?? DEFAULT_VARIANTS;
  for (const v of variants) if (!(v in VARIANTS)) throw new Error(`未知の --variants: ${v}`);
  // 回数を一律に変える（ケースごとの回数に掛ける）
  const scale = Number(value("scale") ?? 1);
  return {
    variants,
    cases: (value("cases")?.split(",") ?? DEFAULT_CASES)
      .map(parseCase)
      .map((c) => Object.assign(c, { runs: Math.max(1, Math.round(c.runs * scale)) })),
    out: value("out") ?? "model-bench",
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
  round: number;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  neurons: number;
  finish: string;
  /** 依頼で渡した語の組（1行が1組）。テーマでは空 */
  groups: string[];
  output: string;
}

type AiResult = {
  response?: unknown;
  choices?: { finish_reason?: string; message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};
type RemoteRun = (model: string, body: Record<string, unknown>) => Promise<AiResult>;

function groupsOf(prompt: string): string[] {
  const at = prompt.indexOf("語の組:");
  if (at < 0) return [];
  return prompt
    .slice(at + 5)
    .trim()
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("/"));
}

/** 生成用の `env.AI`。本文にモデルごとのパラメータを足し、時間とトークン数を記録する */
function generationAi(calls: Call[], variant: Variant, remoteRun: RemoteRun) {
  return {
    aiGatewayLogId: undefined,
    gateway: () => ({ patchLog: async () => {} }),
    async run(model: string, body: Record<string, unknown>) {
      const messages = (body.messages as { role: string; content: string }[]).map((m) =>
        m.role === "user" && variant.promptSuffix !== undefined
          ? { role: m.role, content: `${m.content}\n${variant.promptSuffix}` }
          : m,
      );
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const started = performance.now();
      const result = await remoteRun(model, { ...body, messages, ...variant.extra });
      const seconds = (performance.now() - started) / 1000;
      const choice = result.choices?.[0];
      const inputTokens = result.usage?.prompt_tokens ?? 0;
      const outputTokens = result.usage?.completion_tokens ?? 0;
      calls.push({
        round: calls.length + 1,
        seconds,
        inputTokens,
        outputTokens,
        neurons:
          (inputTokens * variant.usd.input + outputTokens * variant.usd.output) *
          (NEURONS_PER_USD / 1_000_000),
        finish: choice?.finish_reason ?? "",
        groups: groupsOf(prompt),
        output:
          typeof result.response === "string" ? result.response : (choice?.message?.content ?? ""),
      });
      return result;
    },
  };
}

/** 判定用の `env.AI`。本番と同じ判断モデルを呼ぶが、AI Gateway は通さない（第3引数を捨てる） */
function moderationAi(remoteRun: RemoteRun) {
  return {
    aiGatewayLogId: undefined,
    gateway: () => ({ patchLog: async () => {} }),
    run: (model: string, body: Record<string, unknown>) => remoteRun(model, body),
  };
}

/** 1行ごとの記録。どこで落ちたかは、パイプラインに差し込んだ読み取得・判定の記録から決める */
interface Trace {
  readings: Map<string, ReadingOutcome>;
  moderated: Map<string, boolean>;
}

/**
 * 読み取得より前で落ちた行の理由。**batch.ts の無料の検査と同じ順に当てる**（重複・書き出しの
 * 偏り・件数の超過は、ほかの行との関係で決まるのでここでは区別できず「重複・書き出し・件数」にまとめる）
 */
function freeCheckReason(text: string, form: PromptForm): string {
  const isWord = form === "word";
  if (isWord ? !isTypableWord(text) : !isTypableText(text)) return "文字種";
  if (containsNgWord(text)) return "NG語";
  if (containsReadingProneWord(text)) return "読み違えやすい語";
  if (isWord ? isHiraganaOnlyWord(text) : !containsKanji(text)) return "漢字なし";
  if (form === "long" && countSentenceEnds(text) < LONG_SENTENCE_MIN) return "句点不足";
  return "重複・書き出し・件数";
}

interface TextRow {
  variant: string;
  mode: string;
  form: PromptForm;
  name: string;
  run: number;
  round: number;
  line: number;
  given: string;
  text: string;
  result: "採用" | "却下";
  reason: string;
  kana: string;
  keystrokes: number | "";
}

interface GenerationRow {
  variant: string;
  model: string;
  mode: string;
  form: PromptForm;
  name: string;
  run: number;
  error: string;
  rounds: number;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  neurons: number;
  moderationNeurons: number;
  target: number;
  valid: number;
  lines: number;
  rejected: Record<string, number>;
}

function modeOf(c: Case): string {
  if (c.kind === "mix") return c.name;
  if (c.kind === "constraint") return "最適化";
  return { sentence: "テーマ・短文", word: "テーマ・単語", long: "テーマ・長文" }[c.form];
}

function cell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/u.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csv(rows: readonly (readonly unknown[])[]): string {
  // Excel で開いても文字化けしないよう BOM を付ける
  return `﻿${rows.map((r) => r.map(cell).join(",")).join("\n")}\n`;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);
function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.toSorted((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

const options = parseArgs(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });
const localGetReadings = localReadings();
const proxy = await getPlatformProxy<Env>({
  configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
});
const remoteRun = proxy.env.AI.run.bind(proxy.env.AI) as unknown as RemoteRun;
const moderationModel = resolveModerationModel(proxy.env.MODERATION_MODEL);
const moderateEnv = { AI: moderationAi(remoteRun) } as unknown as Env;
const moderateOutputs = createModerateOutputs(moderateEnv, moderationModel);

const textRows: TextRow[] = [];
const generations: GenerationRow[] = [];
const totalRuns = sum(options.cases.map((c) => c.runs)) * options.variants.length;
let done = 0;

for (const c of options.cases) {
  for (let run = 1; run <= c.runs; run++) {
    // 同じ回のうちにモデルを並べて回す（時間帯による混み具合の差を、モデル間で揃える）
    for (const key of options.variants) {
      const variant = VARIANTS[key]!;
      const calls: Call[] = [];
      const trace: Trace = { readings: new Map(), moderated: new Map() };
      let moderationNeurons = 0;
      const mode = modeOf(c);
      const target = playSize(c.form);
      done += 1;
      process.stdout.write(`[${done}/${totalRuns}] ${key}\t${mode}:${c.name}\t#${run} ... `);
      const row: GenerationRow = {
        variant: key,
        model: variant.model,
        mode,
        form: c.form,
        name: c.name,
        run,
        error: "",
        rounds: 0,
        seconds: 0,
        inputTokens: 0,
        outputTokens: 0,
        neurons: 0,
        moderationNeurons: 0,
        target,
        valid: 0,
        lines: 0,
        rejected: {},
      };
      let validTexts = new Set<string>();
      try {
        const result = await generateBatch(
          { AI: generationAi(calls, variant, remoteRun) } as unknown as Env,
          {
            kind: c.kind,
            form: c.form,
            name: c.name,
            themeId: "compare-models",
            path: "regenerate",
            target,
            existing: [],
            vocabulary:
              c.kind === "constraint"
                ? vocabularyFor(c.name)
                : c.kind === "mix"
                  ? mixVocabulary()
                  : undefined,
            model: variant.model as ModelId,
            getReadings: async (texts) => {
              const outcomes = await localGetReadings(texts);
              for (const [i, t] of texts.entries()) trace.readings.set(t, outcomes[i]!);
              return outcomes;
            },
            moderate: async (request) => {
              const allowed = await moderateOutputs({
                ...request,
                onNeurons: (n) => {
                  moderationNeurons += n;
                },
              });
              for (const [i, t] of request.texts.entries()) trace.moderated.set(t, allowed[i]!);
              return allowed;
            },
          },
        );
        row.rounds = result.rounds;
        row.valid = result.valid.length;
        row.rejected = result.rejected as unknown as Record<string, number>;
        validTexts = new Set(result.valid.map((p) => p.text));
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
        row.rounds = calls.length;
      }
      row.seconds = sum(calls.map((x) => x.seconds));
      row.inputTokens = sum(calls.map((x) => x.inputTokens));
      row.outputTokens = sum(calls.map((x) => x.outputTokens));
      row.neurons = sum(calls.map((x) => x.neurons));
      row.moderationNeurons = moderationNeurons;

      // 1行ずつ、どこで落ちたかを決める
      const seen = new Set<string>();
      for (const call of calls) {
        const lines = parseGeneratedOutput(call.output, c.form);
        row.lines += lines.length;
        for (const [i, text] of lines.entries()) {
          const reading = trace.readings.get(text);
          let reason = "";
          if (validTexts.has(text) && !seen.has(text)) {
            reason = "";
          } else if (seen.has(text)) {
            reason = "重複";
          } else if (reading === undefined) {
            reason = freeCheckReason(text, c.form);
          } else if (!reading.ok) {
            reason = "読みが引けない";
          } else if (!isKeystrokeCountInRange(countKeystrokes(reading.reading.roman), c.form)) {
            reason = `打鍵数（${countKeystrokes(reading.reading.roman)}打）`;
          } else if (c.kind === "constraint" && !includesConstraint(reading.reading.kana, c.name)) {
            reason = "指定の音なし";
          } else if (trace.moderated.get(text) === false) {
            reason = "判定（Clef）";
          } else {
            reason = "不明";
          }
          const accepted = reason === "" && validTexts.has(text);
          seen.add(text);
          textRows.push({
            variant: key,
            mode,
            form: c.form,
            name: c.name,
            run,
            round: call.round,
            line: i + 1,
            given: call.groups[i] ?? "",
            text,
            result: accepted ? "採用" : "却下",
            reason,
            kana: reading?.ok === true ? reading.reading.kana : "",
            keystrokes: reading?.ok === true ? countKeystrokes(reading.reading.roman) : "",
          });
        }
      }
      generations.push(row);
      writeOutputs();
      console.log(
        row.error === ""
          ? `採用${row.valid}/${row.lines}行 ${row.seconds.toFixed(1)}秒 生成${row.neurons.toFixed(1)}N 判定${row.moderationNeurons.toFixed(1)}N`
          : `エラー: ${row.error}`,
      );
    }
  }
}

await proxy.dispose();
const finalSummary = writeOutputs();
console.log(finalSummary);
console.log(`出力: ${options.out}/texts.csv, generations.csv, summary.md`);

// 途中で落ちても、それまでの結果が残るよう、生成のたびに全部を書き直す
function writeOutputs(): string {
  writeFileSync(
    join(options.out, "texts.csv"),
    csv([
      [
        "モデル",
        "モード",
        "形式",
        "名前",
        "回",
        "ラウンド",
        "行",
        "渡した語",
        "本文",
        "結果",
        "却下の理由",
        "読み",
        "打鍵数",
      ],
      ...textRows.map((r) => [
        r.variant,
        r.mode,
        r.form,
        r.name,
        r.run,
        r.round,
        r.line,
        r.given,
        r.text,
        r.result,
        r.reason,
        r.kana,
        r.keystrokes,
      ]),
    ]),
  );

  const rejectKeys = [...new Set(generations.flatMap((g) => Object.keys(g.rejected)))];
  writeFileSync(
    join(options.out, "generations.csv"),
    csv([
      [
        "モデル",
        "モデルID",
        "モード",
        "形式",
        "名前",
        "回",
        "エラー",
        "ラウンド数",
        "秒",
        "入力トークン",
        "出力トークン",
        "生成ニューロン",
        "判定ニューロン",
        "目標",
        "採用",
        "出力行",
        ...rejectKeys.map((k) => `却下:${k}`),
      ],
      ...generations.map((g) => [
        g.variant,
        g.model,
        g.mode,
        g.form,
        g.name,
        g.run,
        g.error,
        g.rounds,
        g.seconds.toFixed(2),
        g.inputTokens,
        g.outputTokens,
        g.neurons.toFixed(2),
        g.moderationNeurons.toFixed(2),
        g.target,
        g.valid,
        g.lines,
        ...rejectKeys.map((k) => g.rejected[k] ?? 0),
      ]),
    ]),
  );

  // 集計。モデル×モードと、モデル全体
  const modes = [...new Set(generations.map((g) => g.mode))];
  const baseline = options.variants[0]!;
  function line(label: string, rows: readonly GenerationRow[], baseNeurons: number): string {
    const ok = rows.filter((r) => r.error === "");
    const n = mean(ok.map((r) => r.neurons));
    return `| ${label} | ${rows.length} | ${median(ok.map((r) => r.seconds)).toFixed(1)} | ${Math.max(0, ...ok.map((r) => r.seconds)).toFixed(1)} | ${n.toFixed(1)} | ${baseNeurons === 0 ? "-" : `${(n / baseNeurons).toFixed(2)}x`} | ${mean(ok.map((r) => r.moderationNeurons)).toFixed(1)} | ${sum(ok.map((r) => r.valid))}/${sum(ok.map((r) => r.lines))}（${Math.round((sum(ok.map((r) => r.valid)) / Math.max(1, sum(ok.map((r) => r.lines)))) * 100)}%） | ${ok.filter((r) => r.valid >= r.target).length}/${rows.length} | ${rows.length - ok.length} |`;
  }
  const header = [
    "| モデル | 生成回数 | 秒（中央値） | 秒（最大） | 生成N（平均） | 基準比 | 判定N（平均） | 採用/出力行 | 目標到達 | エラー |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  const summary: string[] = [
    "# 生成モデルの比較（#359）",
    "",
    `基準: ${baseline}。秒と生成N（ニューロン）は1回の生成（最大2ラウンド）あたり。判定Nは Clef-flash の消費で、モデルの比較には含めない。`,
    "",
    "## 全体",
    "",
    ...header,
  ];
  const baseAll = mean(
    generations.filter((g) => g.variant === baseline && g.error === "").map((g) => g.neurons),
  );
  for (const key of options.variants) {
    summary.push(
      line(
        key,
        generations.filter((g) => g.variant === key),
        baseAll,
      ),
    );
  }
  for (const mode of modes) {
    summary.push("", `## ${mode}`, "", ...header);
    const inMode = generations.filter((g) => g.mode === mode);
    const base = mean(
      inMode.filter((g) => g.variant === baseline && g.error === "").map((g) => g.neurons),
    );
    for (const key of options.variants) {
      summary.push(
        line(
          key,
          inMode.filter((g) => g.variant === key),
          base,
        ),
      );
    }
  }
  // 却下の理由の内訳（texts.csv から）
  summary.push("", "## 却下の理由（行数）", "");
  const reasons = [
    ...new Set(
      textRows.filter((r) => r.result === "却下").map((r) => r.reason.replace(/（\d+打）/u, "")),
    ),
  ];
  summary.push(
    `| モデル | ${reasons.join(" | ")} |`,
    `| --- |${reasons.map(() => " ---: |").join("")}`,
  );
  for (const key of options.variants) {
    const mine = textRows.filter((r) => r.variant === key && r.result === "却下");
    summary.push(
      `| ${key} | ${reasons.map((reason) => mine.filter((r) => r.reason.replace(/（\d+打）/u, "") === reason).length).join(" | ")} |`,
    );
  }
  summary.push(
    "",
    `合計: 生成 ${sum(generations.map((g) => g.neurons)).toFixed(0)} N、判定 ${sum(generations.map((g) => g.moderationNeurons)).toFixed(0)} N`,
    "",
  );
  writeFileSync(join(options.out, "summary.md"), summary.join("\n"));
  return summary.join("\n");
}
