import { normalizeConstraintChar } from "../normalize";
import { splitKanaUnits } from "../typing/build";
import { KANA_TABLE } from "../typing/table";
import type { PromptForm } from "../session";

/**
 * 生成されたお題の検証。読み取得の前に無料で弾けるものと、取得後にしか判定できないものがある。
 */

/**
 * 使用してよい文字。**「日本語以外を弾く」では不十分。**
 * `「」` `（）` `〜` `・` `：` は日本語だがキーボードで打てないため、
 * 明示的なホワイトリストで弾く必要がある。
 *
 * - ひらがな U+3041〜U+3096
 * - カタカナ U+30A1〜U+30FA
 * - 漢字 U+4E00〜U+9FFF
 * - 々（同の字点）U+3005。「人々」「時々」のような一般的な語に必要。
 *   読み仮名には現れない（人々→ひとびと）ため、打てない文字にはならない
 * - 記号5種 `、` `。` `ー` `！` `？`
 */
const TYPABLE_TEXT = /^[ぁ-ゖァ-ヺ一-鿿々、。ー！？]+$/u;

/** お題の本文が使用可能な文字だけでできているか（読み取得の前に呼ぶ） */
export function isTypableText(text: string): boolean {
  return TYPABLE_TEXT.test(text);
}

/**
 * 漢字を1文字以上含むか。**ひらがなだけのお題を弾くために使う。**
 *
 * 打鍵そのものは読み仮名に対して行うので、表記がひらがなだけでも「打てる」。
 * それでも弾くのは、画面に出るのが表記の方だからで、ひらがなだけの文は
 * 日本語として不自然に見えるうえ、漢字かな混じり文を読みながら打つという
 * 実際の練習からも外れる。
 *
 * カタカナは条件に入れない。「コーヒーをのむ。」のような文を通してしまうと、
 * 結局ひらがなだけの見た目になるため。**漢字が1つあること**を条件にする。
 */
export function containsKanji(text: string): boolean {
  return /[一-鿿]/u.test(text);
}

/**
 * 単語として打てる文字。**句読点を含めない。**
 *
 * 短文の許可文字から `、` `。` `！` `？` を落としたもの。単語に句読点は現れず、
 * 通してしまうと「単語」と言いながら文の断片が混ざる。長音符 `ー`（ラーメン）と
 * 々（人々）は語の一部として現れるので残す。
 */
const TYPABLE_WORD = /^[ぁ-ゖァ-ヺ一-鿿々ー]+$/u;

/**
 * 単語の本文が使用可能な文字だけでできているか（読み取得の前に呼ぶ）。
 *
 * **「文かどうか」はここでは判定しない。** 単語モードで許すのは1語、または
 * 文にならない2〜3語の組み合わせ（「明太子パスタ」「天神の夜景」）で、
 * 「屋台が並ぶ」のような文は許さない。だがそれを表記から機械的に見分ける手段が
 * 無い。助詞で判定しようとすると、**「はかた」の「は」「たこ焼き」の「た」**の
 * ような語中のかなを助詞と誤認して、普通の語を大量に落とす。
 *
 * よって**文にしないことはプロンプト側の指示で担保する**（`wordRules()`）。
 * ここで効かせるのは文字種と打鍵数の枠だけ。
 */
export function isTypableWord(text: string): boolean {
  return TYPABLE_WORD.test(text);
}

/**
 * ひらがな（と長音符）だけの語か。**単語モードで弾くために使う。**
 *
 * 短文では「漢字を1つ以上含むか」（`containsKanji`）で同じことを判定しているが、
 * **単語にその条件は使えない。**「ラーメン」「モツ鍋」のようなカタカナ語まで
 * 落としてしまうため。狙いは「画面に出る表記がひらがなだけの、読むまでもない
 * お題」を弾くことなので、単語では条件をひらがな限定の側から書く。
 *
 * `isHiraganaOnly`（含む文字の入力検証）は流用できない。あちらは長音符を
 * 許さないので、「らーめん」が「ひらがなだけではない」と判定される。
 */
export function isHiraganaOnlyWord(text: string): boolean {
  return /^[ぁ-ゖー]+$/u.test(text.normalize("NFC"));
}

/** 打鍵数の下限・上限。この範囲を外れたお題は却下する。上限≒ローマ字35文字 */
export const KEYSTROKE_MIN = 10;
export const KEYSTROKE_MAX = 35;

/**
 * 単語の打鍵数。**短文とは別の範囲。**
 *
 * 下限4は「忍者（ninja=5）」「城（shiro=5）」が通り、「木（ki=2）」のような
 * 打ち応えの無い語が落ちる位置。
 *
 * **上限20は、2〜3語の組み合わせを通すための値**（「明太子パスタ」15打、
 * 「博多祇園山笠」19打）。1語だけに絞っていた頃は12だったが、テーマから連想
 * できる単語は100語ほどで頭打ちになり、**遊ぶほど新しい語が出なくなる**ため
 * 組み合わせまで許すことにした（`docs/05-generation.md`）。
 *
 * **短文の範囲（10〜35）と重なるが、それでよい。** 短文と単語の違いは長さでは
 * なく「文かどうか」で、そこは打鍵数では判定できない（下の `isTypableWord` の
 * 注記を参照）。ここは極端なものを落とすための枠にすぎない。
 */
export const WORD_KEYSTROKE_MIN = 4;
export const WORD_KEYSTROKE_MAX = 20;

/**
 * 長文の打鍵数。1本で1プレイなので、短文1プレイ（10問 × 約22打 ≒ 220打）と
 * 同じ程度の手応えになる範囲にする。読み仮名でおよそ150〜220文字。
 * 上限を切るのは、長すぎると1本を打ち切る前に集中が切れるため。
 */
export const LONG_KEYSTROKE_MIN = 250;
export const LONG_KEYSTROKE_MAX = 450;

/**
 * 長文に最低限要る文の数（「。」「！」「？」で数える）。
 *
 * 長文は3〜5文の文章として書かせるが、モデルは**句読点を落として1文ごとに改行する**
 * ことがある（実測）。区切りの無い文章は読みながら打てないので、文の終わりが
 * 足りないものは却下する。2にしてあるのは、句点を省いた「〜だ〜である」の
 * 一続きを落としつつ、3文のうち1つが「！」で終わるような揺れを通すため。
 */
export const LONG_SENTENCE_MIN = 2;

/** 文の終わり（。！？）の数。長文の区切りの検査に使う */
export function countSentenceEnds(text: string): number {
  return (text.match(/[。！？]/gu) ?? []).length;
}

/** その形式の打鍵数の範囲 `[下限, 上限]`。生成の検証とランキングの範囲検査が使う */
export function keystrokeRange(form: PromptForm): [number, number] {
  if (form === "word") return [WORD_KEYSTROKE_MIN, WORD_KEYSTROKE_MAX];
  if (form === "long") return [LONG_KEYSTROKE_MIN, LONG_KEYSTROKE_MAX];
  return [KEYSTROKE_MIN, KEYSTROKE_MAX];
}

/**
 * 打鍵数が範囲内か。**形式で範囲が変わる。**
 *
 * 既定を短文にしてあるのは、呼び出し側（`rebuild-roman` など形式を持たない経路）が
 * これまでどおり動くようにするため。
 */
export function isKeystrokeCountInRange(count: number, form: PromptForm = "sentence"): boolean {
  const [min, max] = keystrokeRange(form);
  return count >= min && count <= max;
}

/**
 * 「含む」モードの判定。指定された文字が**読み仮名**に含まれるかを見る。
 *
 * 表記に現れていなくてよい。「座禅」は表記に「ざ」が無いが、読み「ざぜん」に含まれる。
 * 含むかどうかは文字列ではなく**打鍵の単位で見る**（`findConstraintSpans`）。
 */
export function includesConstraint(readingKana: string, constraintChar: string): boolean {
  return countConstraint(readingKana, constraintChar) > 0;
}

/**
 * 指定文字が読み仮名に何回現れるか。重なりは数えない（「ささ」に「ささ」は1回）。
 *
 * 却下の判定には使わない（1回でも入っていれば有効なお題）。**プロンプトの
 * 「2回以上入れる」がどれだけ効いているかを測るため**に数える。
 * 指示が効いているかどうかは、実際に出てきたお題を数えないと分からない。
 */
export function countConstraint(readingKana: string, constraintChar: string): number {
  return findConstraintSpans(splitKanaUnits(normalizeConstraintChar(readingKana)), constraintChar)
    .length;
}

/** 指定の音が出る箇所1つ。かな単位（`splitKanaUnits` の添字）の範囲で、両端を含む */
export interface ConstraintSpan {
  first: number;
  last: number;
}

/**
 * 子音で始まる打ち方を持つかな。「っ」がその子音を借りられるか（`ka` → `kka`）。
 * 母音・記号・「っ」「ん」の前では借りられず、「っ」は `ltu` と単独で打つ。
 */
function lendsConsonant(unit: string | undefined): boolean {
  if (unit === undefined) return false;
  return (KANA_TABLE[unit] ?? []).some((candidate) => /^[b-df-hj-np-tv-z]/.test(candidate));
}

/**
 * 読みの中で、指定の音が出る箇所。生成の検証（`countConstraint`）とプレイ画面の的
 * （`findTargets`）が同じこれを使う。採用の根拠と違う箇所に的が立たないようにするため。
 *
 * **文字列の部分一致では探さない。打鍵の単位の並びで探す。** 字面では含まれていても、
 * 打つときには別のかなになるものがある。
 *
 * - **後ろの小書きのかなと1単位になる。**「でぃ」は `dhi` で「で」（`de`）を打たない。
 *   「きゃ」（`kya`）も「き」（`ki`）ではない。「ふぁ」「うぉ」「つぁ」「しぇ」も同じ
 * - **前のかなと1単位になる小書きのかな。**「きゃ」の「ゃ」は `kya` の一部で、
 *   「ゃ」（`xya`）を単独では打たない。小書きで始まる音は、前と組まない箇所にしか当たらない
 * - **音の最後の「っ」は、次のかなの子音を借りるときだけ。**「きって」の「きっ」は
 *   `kit`。「きっ。」のように次が母音・記号・文末だと `ltu` と単独で打つので当てない
 *
 * 単位の切り方は打鍵の候補と同じ `splitKanaUnits`。音の側も同じ関数で切って並びを
 * 比べるので、境界がずれた一致（単位の途中から始まる・途中で終わる）は自然に外れる。
 * 「ん」は前後で `n` / `nn` が変わるが、どちらも `n` から打ち始めるので区別しない。
 *
 * 単位ごとに NFC に揃える（分解された濁点で書かれた指定・読みでも当たる）。
 */
export function findConstraintSpans(
  kanaUnits: readonly string[],
  constraintChar: string,
): ConstraintSpan[] {
  const target = splitKanaUnits(normalizeConstraintChar(constraintChar));
  if (target.length === 0) return [];
  const units = kanaUnits.map(normalizeConstraintChar);
  const endsWithSokuon = target.at(-1) === "っ";

  const spans: ConstraintSpan[] = [];
  for (let at = 0; at + target.length <= units.length;) {
    const last = at + target.length - 1;
    const matches =
      target.every((unit, i) => units[at + i] === unit) &&
      (!endsWithSokuon || lendsConsonant(units[last + 1]));
    if (!matches) {
      at++;
      continue;
    }
    spans.push({ first: at, last });
    at = last + 1;
  }
  return spans;
}
