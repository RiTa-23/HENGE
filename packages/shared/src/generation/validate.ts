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
