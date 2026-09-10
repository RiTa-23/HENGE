import { normalizeConstraintChar } from "../normalize";
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

/** 単語の本文が使用可能な文字だけでできているか（読み取得の前に呼ぶ） */
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
 * 打ち応えの無い語が落ちる位置。上限12は「手裏剣（shuriken=9）」が通り、
 * 短い文（10打〜）と重ならない位置に置く。
 */
export const WORD_KEYSTROKE_MIN = 4;
export const WORD_KEYSTROKE_MAX = 12;

/**
 * 打鍵数が範囲内か。**形式で範囲が変わる。**
 *
 * 既定を短文にしてあるのは、呼び出し側（`rebuild-roman` など形式を持たない経路）が
 * これまでどおり動くようにするため。
 */
export function isKeystrokeCountInRange(count: number, form: PromptForm = "sentence"): boolean {
  const [min, max] =
    form === "word" ? [WORD_KEYSTROKE_MIN, WORD_KEYSTROKE_MAX] : [KEYSTROKE_MIN, KEYSTROKE_MAX];
  return count >= min && count <= max;
}

/**
 * 「含む」モードの判定。指定された文字が**読み仮名**に含まれるかを見る。
 *
 * 表記に現れていなくてよい。「座禅」は表記に「ざ」が無いが、読み「ざぜん」に含まれる。
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
  const kana = normalizeConstraintChar(readingKana);
  const target = normalizeConstraintChar(constraintChar);
  if (target === "") return 0;

  let count = 0;
  let from = 0;
  for (;;) {
    const at = kana.indexOf(target, from);
    if (at === -1) return count;
    count++;
    from = at + target.length;
  }
}
