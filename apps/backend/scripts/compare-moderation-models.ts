#!/usr/bin/env bun
/* oxlint-disable no-await-in-loop --
 * 判定は1回ずつ順に回す。並べると Workers AI に一度に投げ、混雑（3040）に当たりやすい。
 * 1回ごとの所要時間も測りたい。
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { MODERATION_CASES, type ModerationCase, type ModerationKind } from "./moderation-cases";

/**
 * 判断モデル Clef と Clef-flash を、日本語の試験セット（`moderation-cases.ts`）で比べる（#330）。
 * 入力（テーマ名・最適化する音）と生成されたお題の検閲に、どちらを・どのしきい値で使うかを決める。
 *
 * **AI だけを wrangler の `getPlatformProxy()` 経由のリモートの Workers AI に向ける**
 * （`wrangler login` の認証を使う。AI Gateway は通さない）。`compare-constraint-prompts.ts` と同じ形。
 *
 * 使い方（リポジトリのルートから。**ローカルで実行する**。クラウドのセッションからは
 * Cloudflare に届かない）:
 *   npx wrangler login                          # Workers AI を呼べるアカウントで（初回だけ）
 *   bun run compare:moderation                  # 既定: 両モデル × batch/single × 1回
 *   bun run compare:moderation --models=clef-flash --modes=batch
 *   --dry-run を付けると AI を呼ばずに（ログインも不要）、依頼の組み立てだけ確かめる
 *
 * **Bun では直接動かさない**（wrangler のリモートバインディングは Bun の `fetch()` で動かない）。
 * `compare:moderation` は bun でバンドルし、Node で起動する。
 *
 * - `batch`: 本番と同じく、形式ごとに1ラウンド分（単語40・短文20・長文5、入力は1件）を1回で判定する
 * - `single`: 1件ずつ判定する。まとめて聞くことで精度が落ちないかを見る
 *
 * 試験セットは約80件。single は件数分呼ぶので、既定（2モデル × 2方式）で数百〜千ニューロン程度を
 * 使う見込み（アカウント全体の無料枠は1日10,000。**利用者の生成と同じ枠**なので空いている時間に）。
 *
 * 依頼は `{ model, state, questions }`、応答は `{ model, answers: { q0: { type: "noul", noul } }, usage }`
 * （noul は「はい」の確率）。実際に呼んで確かめた形。読めなかった応答は生のまま出力に残す。
 *
 * 出力: 画面にしきい値ごとの集計、`--out`（既定 moderation-models.md）に件ごとの確率と生の応答。
 */

type ClefModel = "clef" | "clef-flash";
/** モデルごとに ID が分かれていて、依頼の `model` と揃える（公式ページ） */
const MODEL_ID: Record<ClefModel, string> = {
  clef: "@cf/cloudflare/clef",
  "clef-flash": "@cf/cloudflare/clef-flash",
};
type Mode = "batch" | "single";

/**
 * 入力100万トークンあたりのニューロン。公式の料金表の値（Clef $0.24、Clef-flash $0.038）。
 * 出力は課金されない
 */
const NEURONS_PER_M_INPUT: Record<ClefModel, number> = {
  clef: 21_818,
  "clef-flash": 3_455,
};

/** 本番の1ラウンドの件数（入力の判定は1件） */
const BATCH_SIZE: Record<ModerationKind, number> = {
  theme: 1,
  constraint: 1,
  word: 40,
  sentence: 20,
  long: 5,
};

const KIND_LABEL: Record<ModerationKind, string> = {
  theme: "テーマ名",
  constraint: "最適化する音（この音を含む文を練習する）",
  word: "単語のお題",
  sentence: "短文のお題",
  long: "長文のお題",
};

const SITE =
  "誰でも見られる日本語タイピング練習サイト。利用者が作ったテーマ名と、AIが生成したお題が公開一覧に並ぶ。子どもも使う。";

/** 「載せてよい」の確率がこれ未満なら弾く。灰色帯も弾く方針なので、しきい値は1本 */
const THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

type Options = {
  models: ClefModel[];
  modes: Mode[];
  runs: number;
  out: string;
  dryRun: boolean;
};

function parseArgs(argv: readonly string[]): Options {
  const value = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const runs = Number(value("runs") ?? 1);
  if (!Number.isInteger(runs) || runs <= 0) throw new Error("--runs= には1以上の整数を渡す");
  const models = (value("models") ?? "clef-flash,clef").split(",");
  if (!models.every((m) => m === "clef" || m === "clef-flash")) {
    throw new Error("--models= は clef と clef-flash だけ");
  }
  const modes = (value("modes") ?? "batch,single").split(",");
  if (!modes.every((m) => m === "batch" || m === "single")) {
    throw new Error("--modes= は batch と single だけ");
  }
  return {
    models: models as ClefModel[],
    modes: modes as Mode[],
    runs,
    out: value("out") ?? "moderation-models.md",
    dryRun: argv.includes("--dry-run"),
  };
}

interface ClefRequest {
  model: ClefModel;
  state: Record<string, unknown>;
  questions: Record<string, { type: "noul"; instructions: string }>;
}

/**
 * 判定の基準。**入力（テーマ名・最適化する音）は厳しく、生成されたお題は緩くする。**
 * お題の単語や文に物騒な語が出るのは許し（処刑台・銃声など）、テーマ名で題材そのものに
 * するのは止める。生成お題でしきい値だけを下げると、物騒な語より確率の低い NG 語
 * （パイズリなど）まで通るので、問いの書き方で分ける
 */
const CRITERIA: Record<"input" | "output", string> = {
  input:
    "性的な内容・差別や蔑称・特定の人への攻撃・暴力や犯罪や自傷の勧め・違法薬物の勧めを含むなら載せてはいけない。物語や歴史として物騒な題材を扱うだけなら載せてよい。",
  output:
    "性的な語や描写・差別語や蔑称・特定の人や集団への攻撃・犯罪や自傷や違法薬物を実際にそそのかす内容を含むなら載せてはいけない。武器・刑罰・事件・戦争・病気・身体の語や、物語や歴史の中の暴力の描写は、それだけなら載せてよい。",
};

function criteriaOf(kind: ModerationKind): string {
  return kind === "theme" || kind === "constraint" ? CRITERIA.input : CRITERIA.output;
}

/** 同じ形式の候補をまとめて1回の依頼にする。キーは q0, q1, …（1回に64問まで） */
function buildRequest(
  model: ClefModel,
  kind: ModerationKind,
  texts: readonly string[],
): ClefRequest {
  const candidates = Object.fromEntries(texts.map((text, i) => [`q${i}`, text]));
  const questions = Object.fromEntries(
    texts.map((text, i) => [
      `q${i}`,
      {
        type: "noul" as const,
        instructions: `候補 q${i} の${KIND_LABEL[kind]}「${text}」を、このサイトの公開一覧にそのまま載せてよいか。${criteriaOf(kind)}`,
      },
    ]),
  );
  return {
    model,
    state: { サイト: SITE, 種類: KIND_LABEL[kind], 候補: candidates },
    questions,
  };
}

/**
 * noul の答え `{ type: "noul", noul: 0.89 }` から「はい」の確率を取り出す（実際の応答で確認済み）。
 * 読めなければ undefined（生の応答を出力に残す）
 */
function probabilityOf(answer: unknown): number | undefined {
  const noul = (answer as { noul?: unknown } | null | undefined)?.noul;
  return typeof noul === "number" ? noul : undefined;
}

/** 応答は `{ model, answers: { q0: …, q1: … }, usage }` */
function answersOf(result: unknown): Record<string, unknown> | undefined {
  const answers = (result as { answers?: unknown } | null)?.answers;
  return typeof answers === "object" && answers !== null
    ? (answers as Record<string, unknown>)
    : undefined;
}

function inputTokensOf(result: unknown): number {
  return (result as { usage?: { input_tokens?: number } } | null)?.usage?.input_tokens ?? 0;
}

type RemoteRun = (model: string, body: ClefRequest) => Promise<unknown>;

interface Judged {
  testCase: ModerationCase;
  probability: number | undefined;
}

interface RunStats {
  judged: Judged[];
  calls: number;
  failures: number;
  inputTokens: number;
  millis: number[];
  raw: string[];
}

function chunksOf(kind: ModerationKind, mode: Mode): ModerationCase[][] {
  const cases = MODERATION_CASES.filter((c) => c.kind === kind);
  const size = mode === "single" ? 1 : BATCH_SIZE[kind];
  const chunks: ModerationCase[][] = [];
  for (let i = 0; i < cases.length; i += size) chunks.push(cases.slice(i, i + size));
  return chunks;
}

async function runOnce(model: ClefModel, mode: Mode, remoteRun: RemoteRun | undefined) {
  const stats: RunStats = {
    judged: [],
    calls: 0,
    failures: 0,
    inputTokens: 0,
    millis: [],
    raw: [],
  };
  const kinds = Object.keys(BATCH_SIZE) as ModerationKind[];
  for (const kind of kinds) {
    for (const chunk of chunksOf(kind, mode)) {
      const request = buildRequest(
        model,
        kind,
        chunk.map((c) => c.text),
      );
      stats.calls += 1;
      if (remoteRun === undefined) {
        // 配線の確認用。期待どおりの確率を返す
        stats.judged.push(
          ...chunk.map((c) => ({ testCase: c, probability: c.expected === "ok" ? 0.9 : 0.1 })),
        );
        if (stats.raw.length === 0) stats.raw.push(JSON.stringify(request, null, 2));
        continue;
      }
      const started = performance.now();
      let result: unknown;
      try {
        result = await remoteRun(MODEL_ID[model], request);
      } catch (error) {
        stats.failures += 1;
        stats.raw.push(`${kind} の依頼が失敗: ${String(error)}`);
        stats.judged.push(...chunk.map((c) => ({ testCase: c, probability: undefined })));
        continue;
      }
      stats.millis.push(performance.now() - started);
      stats.inputTokens += inputTokensOf(result);
      const answers = answersOf(result);
      const probabilities = chunk.map((_, i) => probabilityOf(answers?.[`q${i}`]));
      // 最初の応答と、読めなかった応答は生のまま残す（形の確認用）
      if (stats.raw.length === 0 || probabilities.some((p) => p === undefined)) {
        stats.raw.push(JSON.stringify(result, null, 2));
      }
      stats.judged.push(...chunk.map((c, i) => ({ testCase: c, probability: probabilities[i] })));
    }
  }
  return stats;
}

function pct(n: number, d: number): string {
  return d === 0 ? "-" : `${Math.round((n / d) * 100)}%`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** 弾いたか。読めなかった・失敗した件は弾いた扱い（判定不能は止める方針） */
function blocked(j: Judged, threshold: number): boolean {
  return j.probability === undefined || j.probability < threshold;
}

/**
 * しきい値ごとの成績。**読めなかった・失敗した件は弾いた扱い**（判定不能は止める方針）。
 * 「NG を止めた」は高いほど、「OK を止めた」は低いほどよい
 */
function thresholdTable(judged: readonly Judged[]): string[] {
  const ngCases = judged.filter((j) => j.testCase.expected === "ng");
  const okCases = judged.filter((j) => j.testCase.expected === "ok");
  const trickyCases = okCases.filter((j) => j.testCase.tricky === true);
  const lines = [
    "| しきい値 | NG を止めた | OK を止めた | うち紛らわしい OK を止めた |",
    "|---|---|---|---|",
  ];
  for (const t of THRESHOLDS) {
    const caught = ngCases.filter((j) => blocked(j, t)).length;
    const falseBlock = okCases.filter((j) => blocked(j, t)).length;
    const trickyBlock = trickyCases.filter((j) => blocked(j, t)).length;
    lines.push(
      `| ${t} | ${caught}/${ngCases.length}（${pct(caught, ngCases.length)}） | ${falseBlock}/${okCases.length}（${pct(falseBlock, okCases.length)}） | ${trickyBlock}/${trickyCases.length} |`,
    );
  }
  return lines;
}

const options = parseArgs(process.argv.slice(2));
// D1 / KV / 読み Worker のバインディングも立ち上がるが使わない。使うのは AI だけ
const proxy = options.dryRun
  ? undefined
  : await getPlatformProxy<Env>({
      configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
    });
// 第3引数（AI Gateway）を渡さない。本番の Gateway ログに測定の呼び出しを混ぜないため
const remoteRun =
  proxy === undefined ? undefined : (proxy.env.AI.run.bind(proxy.env.AI) as unknown as RemoteRun);

const report: string[] = ["# 判断モデルの比較（Clef / Clef-flash）", ""];
const summary: string[] = [];

for (const model of options.models) {
  for (const mode of options.modes) {
    for (let run = 1; run <= options.runs; run += 1) {
      const stats = await runOnce(model, mode, remoteRun);
      const label = `${model} / ${mode} / ${run}回目`;
      const neurons = (stats.inputTokens / 1_000_000) * NEURONS_PER_M_INPUT[model];
      const unreadable = stats.judged.filter((j) => j.probability === undefined).length;
      const head = [
        `## ${label}`,
        "",
        `- 呼び出し ${stats.calls} 回（失敗 ${stats.failures}）、読めなかった答え ${unreadable}/${stats.judged.length} 件`,
        `- 入力 ${stats.inputTokens} トークン、推定 ${neurons.toFixed(1)} ニューロン`,
        `- 所要時間の中央値 ${Math.round(median(stats.millis))}ms`,
        "",
        ...thresholdTable(stats.judged),
        "",
      ];
      summary.push(...head);
      report.push(
        ...head,
        "| 形式 | 正解 | 載せてよい確率 | お題 |",
        "|---|---|---|---|",
        ...stats.judged.map(
          (j) =>
            `| ${j.testCase.kind} | ${j.testCase.expected}${j.testCase.tricky === true ? "（紛）" : ""} | ${j.probability === undefined ? "読めず" : j.probability.toFixed(3)} | ${j.testCase.text} |`,
        ),
        "",
        "<details><summary>生の応答（最初の1件と、読めなかったもの）</summary>",
        "",
        ...stats.raw.map((raw) => ["```json", raw, "```", ""].join("\n")),
        "</details>",
        "",
      );
    }
  }
}

console.log(summary.join("\n"));
writeFileSync(options.out, report.join("\n"));
console.log(`件ごとの確率と生の応答: ${options.out}`);
await proxy?.dispose();
