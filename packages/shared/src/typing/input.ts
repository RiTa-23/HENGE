/**
 * ブラウザの `KeyboardEvent.key` を打鍵エンジンの入力に翻訳する。
 *
 * **候補テーブルは小文字のASCIIしか持たない**（`a`〜`z` と `! , - . ?`）。
 * `key` をそのまま `pressKey` に渡すと、`Caps Lock` で `"S"` が来た瞬間に
 * **正しく打っているのに全打鍵がミスになる**。しかも画面上は「正しいキーを
 * 押しているのに一文字も進まない」としか見えず、原因に辿り着けない。
 * 変換をここ1か所に閉じ込め、`pressKey` には正規化済みの1文字だけを渡す。
 */

/** ローマ字入力として受理する文字（正規化後） */
const TYPABLE_KEY = /^[a-z!,\-.?]$/;

/**
 * 打鍵として解釈できるなら正規化した1文字を、できないなら null を返す。
 *
 * - 大文字は小文字に倒す（`Caps Lock` と `Shift` のどちらでも同じ結果にする）
 * - `！` `？` は Shift 併用で `key` が `!` `?` として来るので、そのまま受ける
 * - `Shift` `Enter` `F1` のような名前付きキーと、かな・漢字は null
 *
 * **null は「ミス」ではなく「打鍵ではない」。** 呼び出し側で数えないこと。
 */
export function normalizeTypedKey(key: string): string | null {
  if ([...key].length !== 1) return null;
  const lower = key.toLowerCase();
  return TYPABLE_KEY.test(lower) ? lower : null;
}

/**
 * 日本語入力のまま打たれたキーか。**警告を出すためだけに使う。**
 *
 * `<input>` を使わない実装（不変条件7）でも、環境によっては変換途中のキーが
 * `"Process"` として、あるいはかな1文字として届くことがある。これを黙って
 * ミスに数えると、利用者には「正しく打っているのに全部ミスになる」と見える。
 * 打鍵として数えず、代わりに「英数入力に切り替える」ことを画面で伝える。
 */
export function isImeKey(key: string): boolean {
  // 変換対象としてIMEに飲み込まれたキー
  if (key === "Process" || key === "Unidentified") return true;
  if ([...key].length !== 1) return false;
  // ひらがな・カタカナ・漢字・長音符・全角記号
  return /[　-ヿ㐀-䶿一-鿿＀-･]/u.test(key);
}
