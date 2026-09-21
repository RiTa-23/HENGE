/**
 * カタカナをひらがなに変換する。
 *
 * 読み仮名の取得元（読み Worker）はカタカナをカタカナのまま返す。
 * 「スピード」のような語が読みに混ざるため、ローマ字候補テーブルに渡す前に
 * ここで揃える。
 *
 * 長音符「ー」（U+30FC）は変換しない。ひらがな・カタカナのどちらでも同じ文字を使う。
 */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}
