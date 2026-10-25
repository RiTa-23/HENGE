/**
 * テーマ名・含む文字の正規化。
 *
 * 表示は `name`、判定は `normalized_name` を使う。SQLiteにUnicode正規化関数が無いため、
 * **アプリ側で計算して保存する**（クエリ時に正規化することはできない）。
 */

export type ThemeKind = "theme" | "constraint";

/**
 * テーマ名の正規化。
 * NFKC正規化 → 前後の空白除去 → 連続空白を1つに → 英字を小文字化。
 */
export function normalizeThemeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * 含む文字の正規化。NFC正規化のみ。
 *
 * 「が」には1文字表現（U+304C）と「か」+結合濁点（U+304B U+3099）の2表現がある。
 * NFCで前者に揃える。
 */
export function normalizeConstraintChar(char: string): string {
  return char.normalize("NFC");
}

/** kind に応じた正規化。`themes.normalized_name` と KVキーの両方でこれを使う。 */
export function normalizeName(kind: ThemeKind, name: string): string {
  return kind === "theme" ? normalizeThemeName(name) : normalizeConstraintChar(name);
}

/**
 * ひらがなのみか。含む文字の入力検証に使う。
 *
 * **NFC正規化を先に行うこと。** 「か」+結合濁点のような分解表現は、
 * 濁点（U+3099）がひらがなの範囲外なので、正規化前に検査すると正しい入力を弾く。
 *
 * 範囲は ぁ(U+3041)〜ゖ(U+3096)。外来語の読みに現れる ゔ(U+3094) を含めるため
 * ん(U+3093) では止めない。長音符「ー」やカタカナ・漢字・英数字・空白は許可しない。
 */
export function isHiraganaOnly(value: string): boolean {
  return /^[ぁ-ゖ]+$/u.test(value.normalize("NFC"));
}

/**
 * 前のかなと1つの打鍵の単位になる小書きのかな（「きゃ」の「ゃ」、「でぃ」の「ぃ」）。
 * 「っ」は入れない（前ではなく次のかなに付いて子音を重ねる）。
 */
const COMBINING_SMALL_KANA = /^[ぁぃぅぇぉゃゅょゎゕゖ]/u;

/**
 * 最適化する音として指定できないなら、その理由。指定できるなら null。
 * 公開APIの入口（Zod）と作成フォームの事前検査が同じこれを使う。
 *
 * **小書きのかなで始まる音は断る。**「ゃ」は「きゃ」（`kya`）の一部として打ち、単独の
 * 「ゃ」（`xya`）はほぼ現れない。判定は打鍵の単位で行う（`findConstraintSpans`）ので、
 * 通すと語彙が見つからず「語彙が足りない」で断ることになり、理由が伝わらない。
 */
export function constraintCharRejection(value: string): string | null {
  if (!isHiraganaOnly(value)) return "最適化する音はひらがなだけを指定できます";
  if (COMBINING_SMALL_KANA.test(value.normalize("NFC"))) {
    return "小さいかな（ゃ・ぃ など）は前のかなと続けて指定してください（例: きゃ・でぃ）";
  }
  return null;
}
