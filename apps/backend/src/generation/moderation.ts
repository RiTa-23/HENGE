import type { PromptForm, ThemeKind } from "@henge/shared";
import { AiUnavailableError, classifyAiError } from "./ai";

/**
 * 判断モデル（Clef / Clef-flash）による検閲。**入力（テーマ名・最適化する音）と生成されたお題の
 * 両方をここで判定する。** NG 語リスト（`containsNgWord`）の外側、言い換えや表記揺れを拾うため。
 *
 * 判断モデルは文章ではなく、問いごとに「はい」の確率を返す。依頼は
 * `{ model, state, questions: { q0: { type: "noul", instructions } } }`、応答は
 * `{ answers: { q0: { type: "noul", noul: 0.89 } }, usage: { input_tokens } }`
 * （#330 で実際に呼んで確かめた形）。
 *
 * **判定できなかったら通さない。** 例外も、答えが読めない応答も `AiUnavailableError` にして
 * 呼び出し側で止める（利用者には時間をおいた再試行を案内する）。日次の無料枠切れ（3036）だけは
 * `AiQuotaExceededError` のまま（打ち直しても直らない）。
 */

/**
 * 判定に使えるモデルと、入力100万トークンあたりのニューロン（公式の料金表。出力は課金されない）。
 * **依頼の `model` にも短い名前を入れる**（モデルごとに ID が分かれていて、両方を揃える）
 */
export const MODERATION_MODELS = {
  "@cf/cloudflare/clef-flash": { name: "clef-flash", neuronsPerMInput: 3_455 },
  "@cf/cloudflare/clef": { name: "clef", neuronsPerMInput: 21_818 },
} as const;

export type ModerationModelId = keyof typeof MODERATION_MODELS;

/**
 * 既定は Clef-flash。Clef の方が精度は高いが、生成お題1ラウンドの判定で約6倍のニューロンを
 * 使う（#330 の実測）
 */
export const DEFAULT_MODERATION_MODEL: ModerationModelId = "@cf/cloudflare/clef-flash";

/** 環境変数で切り替える。未指定・未知の値なら既定 */
export function resolveModerationModel(value: string | undefined): ModerationModelId {
  return value !== undefined && value in MODERATION_MODELS
    ? (value as ModerationModelId)
    : DEFAULT_MODERATION_MODEL;
}

/**
 * 「載せてよい」の確率がこれ未満なら弾く。**灰色帯も弾く方針なので、しきい値は1本。**
 *
 * 0.4 にしてあるのは、#330 の実測で NG の確率の最高値（0.26 前後）との間が広く、
 * 0.5 にすると「忍者の暗殺術」（0.45）まで止まるため。
 */
export const MODERATION_THRESHOLD = 0.4;

const SITE =
  "誰でも見られる日本語タイピング練習サイト。利用者が作ったテーマ名と、AIが生成したお題が公開一覧に並ぶ。子どもも使う。";

/**
 * 判定の基準。**入力は厳しく、生成されたお題は緩くする。**
 *
 * お題の単語や文に物騒な語が出るのは許し（処刑台・銃声など）、テーマ名で題材そのものに
 * するのは止める。生成お題でしきい値だけを下げると、物騒な語より確率の低い NG 語
 * （パイズリなど）まで通るので、問いの書き方で分ける（#330 の実測）。
 * **文言を変えたら測り直す**（`bun run compare:moderation`）。
 */
const CRITERIA = {
  input:
    "性的な内容・差別や蔑称・特定の人への攻撃・暴力や犯罪や自傷の勧め・違法薬物の勧めを含むなら載せてはいけない。物語や歴史として物騒な題材を扱うだけなら載せてよい。",
  output:
    "性的な語や描写・差別語や蔑称・特定の人や集団への攻撃・犯罪や自傷や違法薬物を実際にそそのかす内容を含むなら載せてはいけない。武器・刑罰・事件・戦争・病気・身体の語や、物語や歴史の中の暴力の描写は、それだけなら載せてよい。",
} as const;

const INPUT_LABEL: Record<ThemeKind, string> = {
  theme: "テーマ名",
  constraint: "最適化する音（この音を含む文を練習する）",
  mix: "練習モードの名前",
};

const OUTPUT_LABEL: Record<PromptForm, string> = {
  word: "単語のお題",
  sentence: "短文のお題",
  long: "長文のお題",
};

/** 判定の対象。入力は1件、生成お題は1ラウンド分をまとめて */
export type ModerationTarget =
  | { type: "input"; kind: ThemeKind; name: string }
  | {
      type: "output";
      form: PromptForm;
      texts: readonly string[];
      /**
       * どのテーマで生成したお題か。**テーマのときだけ渡す。** 物騒な語や身体の語は、題材が
       * 分からないと止めやすい（「戦国時代」の合戦の文、「医療と人体」の病気の文）。#330 の実測で、
       * 添えると短文を誤って止める件数が2件から1件に、単語では20件から9件に減った（単語は
       * いまは判定しない）。最適化・おまかせの名前は題材ではないので渡さない
       */
      theme?: string;
    };

/** AI Gateway のメタデータ（1リクエスト5件まで）。生成と同じキーで、経路だけ `moderate:*` にする */
export interface ModerationMetadata {
  themeId: string;
  kind: ThemeKind;
  round: number;
  path: "moderate:input" | "moderate:output";
}

interface ClefRequest {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, { type: "noul"; instructions: string }>;
}

interface ClefResponse {
  answers?: Record<string, { noul?: unknown } | undefined>;
  usage?: { input_tokens?: number };
}

/**
 * 1回の依頼に入れる問いの上限。**生成お題の1ラウンド（単語40・短文20・長文5）はこれに収まる**
 * ので、判定はラウンドごとに1回の呼び出しで済む
 */
export const MAX_MODERATION_QUESTIONS = 64;

/**
 * 依頼の組み立て。候補は `state` に、問いは候補ごとに1つずつ。**書き方は入力と生成お題で違う**
 * （どちらも実測した形のまま。変えたら `bun run compare:moderation` で測り直す）。
 *
 * - 入力: 判定基準を問いに書く（#330。1件だけなので繰り返しにならない）
 * - 生成お題: **判定基準は `state` に1回だけ置き**、問いには候補の文と短い問いだけ書く（#333）。
 *   基準を問いごとに繰り返すと、トークンの大半がその文になる。1件あたり約209 → 136トークン
 *   （35%減）で、しきい値 0.4 での成績は変わらなかった。問いから候補の文まで外すと
 *   （キーで指すだけにすると）、紛らわしい OK を止める数が3倍以上になったので採らない
 */
export function buildModerationRequest(model: ModerationModelId, target: ModerationTarget) {
  const name = MODERATION_MODELS[model].name;
  if (target.type === "input") {
    const label = INPUT_LABEL[target.kind];
    return {
      model: name,
      state: { サイト: SITE, 種類: label, 候補: { q0: target.name } },
      questions: {
        q0: {
          type: "noul" as const,
          instructions: `候補 q0 の${label}「${target.name}」を、このサイトの公開一覧にそのまま載せてよいか。${CRITERIA.input}`,
        },
      },
    } satisfies ClefRequest;
  }
  return {
    model: name,
    state: {
      サイト: SITE,
      種類: OUTPUT_LABEL[target.form],
      ...(target.theme === undefined ? {} : { テーマ: target.theme }),
      判定基準: CRITERIA.output,
      候補: Object.fromEntries(target.texts.map((text, i) => [`q${i}`, text])),
    },
    questions: Object.fromEntries(
      target.texts.map((text, i) => [
        `q${i}`,
        {
          type: "noul" as const,
          instructions: `候補 q${i}「${text}」を、判定基準に照らして公開一覧にそのまま載せてよいか。`,
        },
      ]),
    ),
  } satisfies ClefRequest;
}

export interface ModerationResult {
  /** 候補ごとに、載せてよいか（入力は1件） */
  allowed: boolean[];
  /** この呼び出しで消費したニューロン。入力トークン数から計算する */
  neurons: number;
}

/**
 * 判定する。**消費は `onNeurons` で、答えを読む前に記録する。** 答えが読めずに止める経路でも、
 * ニューロンは呼んだ時点で消費されている（不変条件11）。呼び出し自体が例外で落ちたときは
 * トークン数が分からないので記録しない（`neuronsUsed` と同じく推定値で埋めない）
 */
export async function moderate(
  env: Env,
  input: {
    model: ModerationModelId;
    target: ModerationTarget;
    metadata: ModerationMetadata;
    onNeurons?: (neurons: number) => Promise<void> | void;
  },
): Promise<ModerationResult> {
  const count = input.target.type === "input" ? 1 : input.target.texts.length;
  if (count === 0) return { allowed: [], neurons: 0 };
  if (count > MAX_MODERATION_QUESTIONS) {
    throw new Error(`判定は1回に${MAX_MODERATION_QUESTIONS}件まで（${count}件渡された）`);
  }

  // 型はモデルごとのオーバーロードで、Clef はまだ載っていない。ここだけ緩める。
  // bind を外すと env.AI の内部状態に触れずに落ちる（ai.ts と同じ）
  const run = env.AI.run.bind(env.AI) as unknown as (
    model: string,
    body: ClefRequest,
    options: Record<string, unknown>,
  ) => Promise<ClefResponse>;

  let response: ClefResponse;
  try {
    response = await run(input.model, buildModerationRequest(input.model, input.target), {
      gateway: {
        id: "henge",
        // 同じ候補には同じ確率が返るのでキャッシュしても結果は変わらないが、生成と揃えて
        // ダッシュボード側の設定に依存させない
        skipCache: true,
        metadata: { ...input.metadata },
      },
    });
  } catch (error) {
    throw classifyAiError(error) ?? new AiUnavailableError("判断モデルを呼べなかった");
  }

  const neurons =
    ((response.usage?.input_tokens ?? 0) * MODERATION_MODELS[input.model].neuronsPerMInput) /
    1_000_000;
  await input.onNeurons?.(neurons);

  const allowed = Array.from({ length: count }, (_, i) => {
    const probability = response.answers?.[`q${i}`]?.noul;
    if (typeof probability !== "number") {
      throw new AiUnavailableError("判断モデルの答えを読めなかった");
    }
    return probability >= MODERATION_THRESHOLD;
  });
  return { allowed, neurons };
}

/**
 * 生成されたお題の判定。`generateBatch` に渡す（読み取得の `GetReadings` と同じく、外から差し込む）。
 * 1ラウンド分を1回で判定し、候補ごとに載せてよいかを返す。**消費は `onNeurons` で記録する**
 */
export type ModerateOutputs = (request: {
  texts: readonly string[];
  kind: ThemeKind;
  form: PromptForm;
  /** テーマ名、または最適化する音・練習モードの名前。**テーマのときだけ判定に添える** */
  name: string;
  themeId: string;
  round: number;
  onNeurons: (neurons: number) => Promise<void> | void;
}) => Promise<boolean[]>;

/**
 * 判断モデルで判定する形式。**単語は判定しない**（NG 語リストだけで弾く）。
 *
 * - 高い: 1ラウンド40件で、判定が最大約19ニューロン（短文の2倍）。生成お題の判定の中で一番重い
 * - 誤検出が多い: 単語は単独だと文脈が無く、テーマ名を添えても紛らわしい OK を191件中8〜9件止めた
 *   （交尾・キス・授乳など。#330・#333）。短文は77件中0〜1件
 * - 単語は1語なので、言い換えや語の組み合わせで不適切になる余地が文より小さい。NG 語リストには、
 *   判断モデルが単語で見逃した語も足してある（雌豚・黒んぼ・片輪など）
 */
const MODERATED_OUTPUT_FORMS: ReadonlySet<PromptForm> = new Set(["sentence", "long"]);

export function createModerateOutputs(env: Env, model: ModerationModelId): ModerateOutputs {
  return async (request) => {
    // 判定しない形式はAIを呼ばずに全件通す（消費も無い）
    if (!MODERATED_OUTPUT_FORMS.has(request.form)) return request.texts.map(() => true);
    const { allowed } = await moderate(env, {
      model,
      target: {
        type: "output",
        form: request.form,
        texts: request.texts,
        ...(request.kind === "theme" ? { theme: request.name } : {}),
      },
      metadata: {
        themeId: request.themeId,
        kind: request.kind,
        round: request.round,
        path: "moderate:output",
      },
      onNeurons: request.onNeurons,
    });
    return allowed;
  };
}
