/**
 * カタカナをひらがなに変換する。
 *
 * 読み仮名の取得元（Yahoo! ルビ振りAPI）は、漢字を含まない語にはふりがなを返さず
 * 表記をそのまま返す。「スピード」のようなカタカナ語がそのまま読みに混ざるため、
 * ローマ字候補テーブルに渡す前にここで揃える。
 *
 * 長音符「ー」（U+30FC）は変換しない。ひらがな・カタカナのどちらでも同じ文字を使う。
 */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}
