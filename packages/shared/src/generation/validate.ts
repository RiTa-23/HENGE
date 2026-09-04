import { normalizeConstraintChar } from "../normalize";

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

/** 打鍵数の下限・上限。この範囲を外れたお題は却下する */
export const KEYSTROKE_MIN = 10;
export const KEYSTROKE_MAX = 40;

export function isKeystrokeCountInRange(count: number): boolean {
  return count >= KEYSTROKE_MIN && count <= KEYSTROKE_MAX;
}

/**
 * 「含む」モードの判定。指定された文字が**読み仮名**に含まれるかを見る。
 *
 * 表記に現れていなくてよい。「座禅」は表記に「ざ」が無いが、読み「ざぜん」に含まれる。
 */
export function includesConstraint(readingKana: string, constraintChar: string): boolean {
  return normalizeConstraintChar(readingKana).includes(normalizeConstraintChar(constraintChar));
}
