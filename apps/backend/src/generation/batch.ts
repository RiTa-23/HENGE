/* oxlint-disable no-await-in-loop --
 * ラウンドは直列でなければならない。1ラウンド目の結果が目標に達したかを見てから
 * 2ラウンド目を回すか決めるため、並列化すると常に2ラウンド走ってしまう。
 */
import {
  containsKanji,
  countConstraint,
  countKeystrokes,
  includesConstraint,
  isKeystrokeCountInRange,
  isTypableText,
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

/**
 * テーマ名を文中に使える文の上限（**テーマモードのみ**）。
 *
 * テーマ名で**始まる**文は別の検査（`themeStart`）で1文ごとに弾く。ここは
 * **文中**での連続使用の上限。「博多の〜」が20文並んだ実測では、文頭検査が
 * ない状態でこの上限だけが効き、3本に削られて15問に届かなかった。
 *
 * **「含む」モードでは使わない。** 指定文字を含むのは仕様であり、
 * ここで上限をかけると本末転倒。
 */
const THEME_NAME_MAX = 3;

/**
 * 読み仮名の先頭2かなが同じ文の上限。
 *
 * テーマ語で始まる文は `themeStart` で1文ごとに弾くが、この検査は
 * **テーマ名と一致しない関連語**（テーマ「TypeScript」で「型は〜」「型が〜」
 * が並んだ）を拾う。表記の先頭では「型は／型が」が2文字目で分かれるため、
 * キーは**読み仮名の先頭2かな**（かたは／かたが→「かた」）。3本までは
 * 許す（締めすぎると生成そのものが失敗する。OPENING_MAX と同じ理由）。
 */
const START_PREFIX_LENGTH = 2;
const START_MAX = 3;

export interface ValidPrompt {
  text: string;
  readingKana: string;
  readingRomanJson: string;
  keystrokeCount: number;
}

export interface RejectionCounts {
  /** 使用できない文字が含まれていた（読みにテーブル外のかなが残った場合を含む） */
  charset: number;
  /** 漢字が1つも無い（ひらがなだけの文）*/
  kanji: number;
  /** 同じ書き出しの文が既に採用上限まである */
  opening: number;
  /** 打鍵数が10〜35の範囲外 */
  keystroke: number;
  /** 「含む」モードで、指定文字が読み仮名に無かった */
  constraint: number;
  /** テーマ名（またはその読み）で始まる文（テーマモードのみ） */
  themeStart: number;
  /** テーマ名を含む文が採用上限を超えた（テーマモードのみ） */
  themeName: number;
  /** 読み仮名の先頭2かなが同じ文が採用上限を超えた */
  start: number;
}

export interface BatchResult {
  valid: ValidPrompt[];
  rejected: RejectionCounts;
  rounds: number;
  reachedTarget: boolean;
}

export interface GenerateBatchInput {
  kind: ThemeKind;
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
    themeStart: 0,
    themeName: 0,
    start: 0,
  };
  const seen = new Set(input.existing);
  // **既存お題は数えない。** 止めたいのは「1回の生成が1つの型で埋まる」ことで、
  // 過去のプールに何本あるかは別の話。既存を数えると、偏った状態で作られた
  // プール（実測で同じ書き出しが23本あった）に塞がれて補充が失敗する。
  // ラウンドはまたいで数える（2ラウンド目で同じ型を作り直させない）
  const state: ValidateState = {
    openings: new Map(),
    startPrefixes: new Map(),
    themeNameCount: 0,
  };
  let rounds = 0;
  let hint: string | undefined;

  // 文頭のテーマ語を判定するための、テーマ名の読み。読めない名前
  // （アルファベットなど。ルビ振りAPIがエラーを返す）でも生成は続行し、
  // 読みベースの検査だけをスキップする。外部サブリクエストを1回消費するため、
  // 合計は 2 × N_REQUEST + 1 回（上限50以内）
  let nameReading: string | undefined;
  if (input.kind === "theme") {
    try {
      nameReading = (await input.getReading(input.name)).kana;
    } catch {
      // 読みが取れない名前でも text.startsWith による表記の照合は効く
      nameReading = undefined;
    }
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round;

    const { texts, logId } = await requestPrompts(env, {
      model: input.model,
      kind: input.kind,
      name: input.name,
      count: N_REQUEST,
      existing: input.existing,
      metadata: { themeId: input.themeId, kind: input.kind, round, path: input.path },
      hint,
    });

    const validBefore = valid.length;
    const rejectedBefore = { ...rejected };
    await validateInto(texts, input, seen, state, nameReading, valid, rejected);

    if (logId !== undefined) {
      // ログは1リクエスト（＝1ラウンド）に紐づくため、採用数も却下数も
      // **そのラウンド分だけ**を渡す。累積を渡すと2ラウンド目で1ラウンド目が二重計上される
      const roundRejected = subtract(rejected, rejectedBefore);
      const record = recordGenerationResult(env, logId, {
        requested: N_REQUEST,
        valid: valid.length - validBefore,
        rejected: { ...roundRejected },
        constraintTwice: countTwice(valid.slice(validBefore), input),
      }).catch(() => {
        // 計測の失敗で生成そのものを落とさない
      });
      if (input.waitUntil !== undefined) input.waitUntil(record);
      else await record;
    }

    if (valid.length >= input.target) break;
    // 次のラウンドがあるなら、直前の却下理由を伝える。**全体を数えさせる初手の
    // 指示より、直前の失敗へのフィードバックの方が効く**（テーマ語の偏りは
    // これで救われる。docs/05-generation.md）
    if (round < MAX_ROUNDS) hint = retryHint(subtract(rejected, rejectedBefore), input.name);
  }

  return { valid, rejected, rounds, reachedTarget: valid.length >= input.target };
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
    themeStart: after.themeStart - before.themeStart,
    themeName: after.themeName - before.themeName,
    start: after.start - before.start,
  };
}

/**
 * 2ラウンド目に添えるフィードバック。直前ラウンドの却下内訳のうち
 * **最も多い理由**に対して、どう直せば受け入れられるかを1文で伝える。
 *
 * 初手の指示で頼むより、直前の失敗へのフィードバックの方が効く
 * （テーマ語の偏りはこれで救われた。実測: ヒント無しで文頭テーマ語13/20、
 * ヒント付きで6〜10/20）。同一カテゴリが3件以上のときだけ出す。
 * 軽微な却下にまで反応すると、指示が次々に足されて主旨が散らかる。
 */
function retryHint(delta: RejectionCounts, name: string): string | undefined {
  const candidates: [number, string][] = [
    [
      delta.themeStart,
      `テーマの名前（とその読み）で始まる文は受け付けられません。すべての文を、テーマの名前「${name}」以外の語から書き始めてください（名前は文の途中にだけ使う）`,
    ],
    [
      delta.themeName,
      `テーマ名を含む文が多すぎました。名前は文の途中にだけ使い、できるだけ少なくしてください`,
    ],
    [
      delta.keystroke,
      "長さが範囲外の文は受け付けられません。1文はひらがなに直して8〜14文字程度に収めてください（カタカナ語を多く置くと打鍵数が膨らみます）",
    ],
    [
      delta.charset,
      "使えない文字を含む文は受け付けられません。ひらがな・カタカナ・漢字と、記号は「、」「。」「ー」「！」「？」だけを使ってください（アルファベット・数字・空白は書かない）",
    ],
    [
      delta.constraint,
      `指定文字が読みに含まれない文は受け付けられません。どの文も、その読み仮名に「${name}」を必ず入れてください`,
    ],
    [
      delta.start,
      "読みの頭が同じ文は上限までしか受け付けられません。文の切り出し方（主語・修飾語・場所）を毎回変えてください",
    ],
    [delta.kanji, "ひらがなだけの文は受け付けられません。各文に漢字を1つ以上使ってください"],
  ];

  const top = candidates.reduce((best, current) => (current[0] > best[0] ? current : best));
  return top[0] >= 3 ? `前回の短文は次の理由で多くが拒否されました。${top[1]}` : undefined;
}

/** 書き出しの重なりを見るためのキー。表記の先頭数文字 */
function openingOf(text: string): string {
  return [...text].slice(0, OPENING_PREFIX_LENGTH).join("");
}

/** 書き出しの重なりを見るためのキー。読み仮名の先頭2かな */
function startPrefixOf(readingKana: string): string {
  return [...readingKana].slice(0, START_PREFIX_LENGTH).join("");
}

/** ラウンドをまたいで保持する検証の状態。openings / startPrefixes / テーマ名の採用数 */
interface ValidateState {
  openings: Map<string, number>;
  startPrefixes: Map<string, number>;
  themeNameCount: number;
}

async function validateInto(
  texts: string[],
  input: GenerateBatchInput,
  seen: Set<string>,
  state: ValidateState,
  nameReading: string | undefined,
  valid: ValidPrompt[],
  rejected: RejectionCounts,
): Promise<void> {
  // 重複・文字種・漢字の有無は、読み取得の前に無料で弾く（外部サブリクエストを使わない）
  const candidates = texts.filter((text) => {
    if (seen.has(text)) return false;
    seen.add(text);
    if (!isTypableText(text)) {
      rejected.charset++;
      return false;
    }
    // **ひらがなだけの文を通さない。** 打鍵は読み仮名に対して行うので「打てる」が、
    // 画面に出るのは表記の方で、漢字かな混じり文を読みながら打つ練習から外れる
    if (!containsKanji(text)) {
      rejected.kanji++;
      return false;
    }
    // **テーマ名で始まる文を通さない。** テーマ「博多」で「博多の〜」が20文並んだ。
    // 1文ごとに判定できる局所ルール（docs/05-generation.md）
    if (input.kind === "theme" && text.startsWith(input.name)) {
      rejected.themeStart++;
      return false;
    }
    // **同じ書き出しを並べない。** 完全一致ではないので seen では拾えない
    const opening = openingOf(text);
    const used = state.openings.get(opening) ?? 0;
    if (used >= OPENING_MAX) {
      rejected.opening++;
      return false;
    }
    state.openings.set(opening, used + 1);
    // **テーマ名の文中での使いすぎを止める。** 文頭検査で始まりは防いだうえで、
    // 途中での連続使用を3本までに制限する。テーマモードのみ（「含む」モードは
    // 指定文字を含むのが仕様）
    if (input.kind === "theme" && text.includes(input.name)) {
      if (state.themeNameCount >= THEME_NAME_MAX) {
        rejected.themeName++;
        return false;
      }
      state.themeNameCount++;
    }
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
    if (!isKeystrokeCountInRange(keystrokeCount)) {
      rejected.keystroke++;
      continue;
    }
    if (input.kind === "constraint" && !includesConstraint(reading.kana, input.name)) {
      rejected.constraint++;
      continue;
    }
    // **読みの形でテーマ語から始まる文も通さない。** テーマ「TypeScript」で
    // 「タイプスクリプトは〜」が20文並んだ。表記には名前が現れないため、
    // テーマ名の読みとの照合で弾く（名前が読めないときはこの検査をスキップ）
    if (nameReading !== undefined && reading.kana.startsWith(nameReading)) {
      rejected.themeStart++;
      continue;
    }
    // **読みの頭が同じ文を並べない。** 関連語の文頭偏り（「型は〜」「型が〜」）を
    // 拾う。表記の先頭では2文字目で分かれてしまうため、読み仮名で見る
    const startPrefix = startPrefixOf(reading.kana);
    const usedStart = state.startPrefixes.get(startPrefix) ?? 0;
    if (usedStart >= START_MAX) {
      rejected.start++;
      continue;
    }
    state.startPrefixes.set(startPrefix, usedStart + 1);

    valid.push({
      text,
      readingKana: reading.kana,
      readingRomanJson: JSON.stringify(reading.roman),
      keystrokeCount,
    });
  }
}
