/**
 * 匿名ユーザーのオフセットを localStorage で持つ。
 *
 * **匿名ユーザーのデータをサーバーに置かない**（不変条件10）。ゲストIDを
 * サーバーで発行するコストの方が、改ざんされる不利益より大きい。改ざんされても
 * 「まだ遊んでいないお題を先に見る／既に見たお題を再度見る」だけで、
 * 他人への影響も金銭的損失もない。範囲外の値は API 側の Zod が弾く。
 *
 * ログイン中はサーバーが `user_theme_progress` で持つので、ここは使わない。
 */

const PREFIX = "henge:offset:";

/** localStorage が使えない環境（プライベートウィンドウ等）でも落とさない */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readOffset(themeId: string): number {
  const raw = storage()?.getItem(PREFIX + themeId);
  if (raw === null || raw === undefined) return 0;
  const value = Number.parseInt(raw, 10);
  // 壊れた値・負数は「最初から」に倒す。API に弾かれて遊べなくなるより良い
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function writeOffset(themeId: string, offset: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0) return;
  try {
    storage()?.setItem(PREFIX + themeId, String(offset));
  } catch {
    // 容量超過・書き込み禁止。進捗が残らないだけでプレイは続けられる
  }
}
