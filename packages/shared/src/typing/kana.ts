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

/**
 * ひらがなをカタカナに変換する。`katakanaToHiragana` の逆。
 *
 * 辞書（user-lex.csv）の読みの列はカタカナなので、読み違い報告の承認で
 * 申告された読みをここで揃える。ゔ（U+3094）は ヴ に、長音符はそのまま。
 */
export function hiraganaToKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}
