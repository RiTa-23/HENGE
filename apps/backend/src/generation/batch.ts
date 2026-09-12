/* oxlint-disable no-await-in-loop --
 * ラウンドは直列でなければならない。1ラウンド目の結果が目標に達したかを見てから
 * 2ラウンド目を回すか決めるため、並列化すると常に2ラウンド走ってしまう。
 */
import {
  containsKanji,
  countConstraint,
  countKeystrokes,
  includesConstraint,
  isHiraganaOnlyWord,
  isKeystrokeCountInRange,
  isTypableText,
  isTypableWord,
  type PromptForm,
  type ThemeKind,
  UnsupportedKanaError,
} from "@henge/shared";
import type { GetReading } from "../reading/index";
import { recordGenerationResult, requestPrompts } from "./ai";
import type { ModelId } from "./model";

/**
 * 1ラウンドあたりのリクエスト件数。
 *
 * **`MAX_ROUNDS × N_REQUEST ≤ 50` を必ず満たすこと。**
 * 読み仮名の取得はお題1件につき外部サブリクエストを1回消費し、
 * Workers無料プランの上限は1実行につき50回。20件×3ラウンド=60回で静かに失敗する。
 * N_REQUEST を変える場合はラウンド数もセットで見直すこと。
 */
export const N_REQUEST = 20;
export const MAX_ROUNDS = 2;

/**
 * 長文の1ラウンドの件数。**1本が長いので少なく頼む。**
 *
 * 1本≒短文15問ぶんの出力で、20本頼むと応答が長すぎる（時間も `max_tokens` も）。
 * 1プレイ1本・在庫目標3本なので、5本×2ラウンド＝最大10本で十分埋まる。
 * 読み取得も1本1回なので `2 × 5 = 10 ≤ 50` に余裕で収まる。
 */
export const N_REQUEST_LONG = 5;

/** その形式の1ラウンドの件数。**`MAX_ROUNDS × これ ≤ 50` を満たすこと** */
export function requestCount(form: PromptForm): number {
  return form === "long" ? N_REQUEST_LONG : N_REQUEST;
}

/**
 * 目標に届かなくても、取れた分を保存してよい形式か。
 *
 * 短文は目標（1プレイ分＝15問）未達なら1件も保存せず失敗にするが、単語と長文は
 * **目標と1回で作れる上限が近い**（単語: 目標20に対し最大40件、長文: 目標3に対し
 * 最大10本で、却下や重複でここから減る）。同じ扱いにすると、少し届かないだけで
 * 有効なお題と消費したニューロンを捨てて何度も押させ、普通に作れているテーマにまで
 * 「生成困難」の印が付く。**1件も作れなかったときだけ**失敗・困難とする。
 */
export function acceptsPartialBatch(form: PromptForm): boolean {
  return form !== "sentence";
}

/**
 * 書き出しの重なりを見る文字数と、同じ書き出しを何本まで採るか。
 *
 * **プロンプトの言うことを聞かなかったときの歯止め。** 「し」を含む文を作れと
 * 言うと、モデルは都合のいい語を1つ見つけて全部それで埋めてくる
 * （実測で21件中14件が「しんしんと〜」だった）。完全一致ではないので `seen` は
 * 素通りし、そのままプールに入ると「毎回違うお題」という前提が崩れる。
 *
 * **締めすぎると生成そのものが失敗する。** 3文字・2本で試したところ、
 * 「ぴ」で40件中18件、「ぬ」で11件がここで落ち、15問に届かなかった（実測）。
 * 指定文字を必ず入れさせる以上、書き出しはある程度似るのが自然で、
 * それ自体は問題ではない。止めたいのは「1つの型で全部を埋める」ことだけ。
 *
 * 4文字・3本にしてある。「しんしんと〜」14件は3件まで削れる一方、
 * 「しんぶん」「しんこう」「しんぱい」は先頭4文字が違うので互いに干渉しない。
 */
const OPENING_PREFIX_LENGTH = 4;
const OPENING_MAX = 3;

export interface ValidPrompt {
  text: string;
  readingKana: string;
  readingRomanJson: string;
  keystrokeCount: number;
}

export interface RejectionCounts {
  /** 使用できない文字が含まれていた（読みにテーブル外のかなが残った場合を含む） */
  charset: number;
  /**
   * 表記がひらがなだけだった。**単語でもこのラベルを使う**（単語の条件は
   * 「漢字を1つ以上」ではなく「ひらがなだけにしない」だが、狙いは同じ）。
   * ラベルを増やすと AI Gateway のメタデータ5件の枠に収まらなくなる
   */
  kanji: number;
  /** 同じ書き出しの文が既に採用上限まである */
  opening: number;
  /** 打鍵数が10〜35の範囲外 */
  keystroke: number;
  /** 「含む」モードで、指定文字が読み仮名に無かった */
  constraint: number;
  /**
   * 既にプールにある（または同じ生成の中で重複した）ため落としたもの。
   *
   * **これが見えないと診断できない。** 重複は読み取得の前に無言で捨てていたので、
   * ダッシュボード上は「ほとんど却下されていない健全な生成」に見えるのに、
   * 実際の採用はごくわずか、という食い違いが起きていた。単語はテーマあたりの
   * 語彙が有限で、プールが育つほどここが増える。
   */
  dup: number;
}

export interface BatchResult {
  valid: ValidPrompt[];
  rejected: RejectionCounts;
  rounds: number;
  reachedTarget: boolean;
  /** 全ラウンドの消費ニューロンの合計 */
  neurons: number;
}

export interface GenerateBatchInput {
  kind: ThemeKind;
  /** 出題の形式。指示も検証もここで変わる */
  form: PromptForm;
  /** テーマ名、または「含む文字」 */
  name: string;
  /** メタデータ用。新規作成時はまだIDが無いので採番前の値を渡す */
  themeId: string;
  path: "create" | "regenerate" | "refill";
  /** 有効何件を目指すか */
  target: number;
  /** 重複回避の文脈。既存お題の本文 */
  existing: string[];
  model: ModelId;
  getReading: GetReading;
  /** 検証結果のログ書き戻しを遅らせる。Honoハンドラからは c.executionCtx.waitUntil を渡す */
  waitUntil?: (promise: Promise<unknown>) => void;
  /**
   * 1ラウンド分の消費ニューロン。**AI呼び出しの直後に呼び、完了を待つ。**
   *
   * 戻り値（`BatchResult.neurons`）を待って記録すると、読み仮名の取得で例外が
   * 飛ぶ経路と、**クライアントが切断してinvocationごと打ち切られる経路**で
   * 記録が漏れる。切断されると残りの処理はキャンセルされうるため、記録は
   * 「消費が確定した直後」に済ませておく必要がある。
   */
  onNeurons?: (neurons: number) => Promise<void> | void;
}

/**
 * お題の生成バッチ。新規作成（同期）と背景補充（非同期）の両方から呼ぶ。
 *
 * 1. LLMに N_REQUEST 件リクエスト
 * 2. ホワイトリスト検査（読み取得の前に無料で弾く）
 * 3. getReading() で読み仮名・ローマ字を取得
 * 4. 打鍵数の検査
 * 5. 「含む」モードなら指定文字の検査
 * 6. 目標に達していなければ、もう1ラウンドだけ繰り返す
 */
export async function generateBatch(env: Env, input: GenerateBatchInput): Promise<BatchResult> {
  const valid: ValidPrompt[] = [];
  const rejected: RejectionCounts = {
    charset: 0,
    kanji: 0,
    opening: 0,
    keystroke: 0,
    constraint: 0,
    dup: 0,
  };
  const seen = new Set(input.existing);
  // **既存お題は数えない。** 止めたいのは「1回の生成が1つの型で埋まる」ことで、
  // 過去のプールに何本あるかは別の話。既存を数えると、偏った状態で作られた
  // プール（実測で同じ書き出しが23本あった）に塞がれて補充が失敗する。
  // ラウンドはまたいで数える（2ラウンド目で同じ型を作り直させない）
  const openings = new Map<string, number>();
  let rounds = 0;
  let neurons = 0;

  const requested = requestCount(input.form);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round;

    const {
      texts,
      logId,
      neurons: roundNeurons,
    } = await requestPrompts(env, {
      model: input.model,
      kind: input.kind,
      form: input.form,
      name: input.name,
      count: requested,
      existing: input.existing,
      metadata: {
        themeId: input.themeId,
        kind: input.kind,
        round,
        // 形式はメタデータの枠が無いので経路の値に畳む（ai.ts の GenerationPath）。
        // 新規作成は短文しか作らないので `create:word` / `create:long` は存在しない
        path:
          input.form !== "sentence" && input.path !== "create"
            ? (`${input.path}:${input.form}` as const)
            : input.path,
      },
    });

    // **検証より先に記録を済ませる。** この行より後で何が起きても（読み取得の例外、
    // クライアント切断によるキャンセル）、AIの消費はもう確定している
    neurons += roundNeurons;
    await input.onNeurons?.(roundNeurons);

    const validBefore = valid.length;
    const rejectedBefore = { ...rejected };
    await validateInto(texts, input, seen, openings, valid, rejected);

    if (logId !== undefined) {
      // ログは1リクエスト（＝1ラウンド）に紐づくため、採用数も却下数も
      // **そのラウンド分だけ**を渡す。累積を渡すと2ラウンド目で1ラウンド目が二重計上される
      const record = recordGenerationResult(env, logId, {
        requested,
        valid: valid.length - validBefore,
        rejected: { ...subtract(rejected, rejectedBefore) },
        constraintTwice: countTwice(valid.slice(validBefore), input),
      }).catch(() => {
        // 計測の失敗で生成そのものを落とさない
      });
      if (input.waitUntil !== undefined) input.waitUntil(record);
      else await record;
    }

    if (valid.length >= input.target) break;
  }

  return { valid, rejected, rounds, neurons, reachedTarget: valid.length >= input.target };
}

/**
 * そのラウンドで採用したお題のうち、指定文字を**2回以上**含むものの数。
 *
 * 却下の条件ではない（1回でも入っていれば有効）。プロンプトの
 * 「○個以上の文では2回以上入れる」がどれだけ効いているかを AI Gateway 側で
 * 見るための計測値。**指示が効いているかは、出てきたお題を数えないと分からない。**
 * テーマモードでは意味を持たないので undefined を返す。
 */
function countTwice(roundValid: ValidPrompt[], input: GenerateBatchInput): number | undefined {
  if (input.kind !== "constraint") return undefined;
  return roundValid.filter((prompt) => countConstraint(prompt.readingKana, input.name) >= 2).length;
}

function subtract(after: RejectionCounts, before: RejectionCounts): RejectionCounts {
  return {
    charset: after.charset - before.charset,
    kanji: after.kanji - before.kanji,
    opening: after.opening - before.opening,
    keystroke: after.keystroke - before.keystroke,
    constraint: after.constraint - before.constraint,
    dup: after.dup - before.dup,
  };
}

/** 書き出しの重なりを見るためのキー。表記の先頭数文字 */
function openingOf(text: string): string {
  return [...text].slice(0, OPENING_PREFIX_LENGTH).join("");
}

async function validateInto(
  texts: string[],
  input: GenerateBatchInput,
  seen: Set<string>,
  openings: Map<string, number>,
  valid: ValidPrompt[],
  rejected: RejectionCounts,
): Promise<void> {
  const isWord = input.form === "word";

  // 重複・文字種・漢字の有無は、読み取得の前に無料で弾く（外部サブリクエストを使わない）
  const candidates = texts.filter((text) => {
    if (seen.has(text)) {
      rejected.dup++;
      return false;
    }
    seen.add(text);
    // **単語は句読点を許さない。** 短文の文字種で通すと、「単語」と言いながら
    // 文の断片（「忍者、影」）が混ざる
    if (isWord ? !isTypableWord(text) : !isTypableText(text)) {
      rejected.charset++;
      return false;
    }
    // **表記がひらがなだけの文・語を通さない。** 打鍵は読み仮名に対して行うので
    // 「打てる」が、画面に出るのは表記の方で、読みながら打つ練習から外れる。
    // **単語に「漢字を1つ以上」は使えない**（「ラーメン」まで落ちる）ので、
    // 単語ではひらがな限定の側から判定する
    if (isWord ? isHiraganaOnlyWord(text) : !containsKanji(text)) {
      rejected.kanji++;
      return false;
    }
    // **同じ書き出しを並べない。** 完全一致ではないので seen では拾えない
    const opening = openingOf(text);
    const used = openings.get(opening) ?? 0;
    if (used >= OPENING_MAX) {
      rejected.opening++;
      return false;
    }
    openings.set(opening, used + 1);
    return true;
  });

  // 読み取得は1件につき外部サブリクエストを1回消費する。並列にして待ち時間だけ縮める
  const readings = await Promise.allSettled(
    candidates.map(async (text) => ({ text, reading: await input.getReading(text) })),
  );

  for (const result of readings) {
    if (result.status === "rejected") {
      // テーブルに無いかなが読みに残っていた場合。APIの障害はここで握りつぶさず外へ投げる
      if (result.reason instanceof UnsupportedKanaError) {
        rejected.charset++;
        continue;
      }
      throw result.reason;
    }

    const { text, reading } = result.value;
    const keystrokeCount = countKeystrokes(reading.roman);
    if (!isKeystrokeCountInRange(keystrokeCount, input.form)) {
      rejected.keystroke++;
      continue;
    }
    if (input.kind === "constraint" && !includesConstraint(reading.kana, input.name)) {
      rejected.constraint++;
      continue;
    }

    valid.push({
      text,
      readingKana: reading.kana,
      readingRomanJson: JSON.stringify(reading.roman),
      keystrokeCount,
    });
  }
}
