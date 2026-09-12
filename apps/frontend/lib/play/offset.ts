import type { PromptForm } from "@henge/shared";

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

/**
 * 形式ごとのキー。**短文はこれまでのキーのまま。**
 *
 * 短文にも接尾辞を付けると、既に遊んでいる人の進捗が全部0に戻り、**一度見た
 * お題がもう一度配られる**（「毎回違うお題」が崩れる）。単語・長文は新しいプールなので
 * 接尾辞（形式名）を付けて分ける。
 */
function keyOf(themeId: string, form: PromptForm): string {
  return form === "sentence" ? PREFIX + themeId : `${PREFIX}${themeId}:${form}`;
}

/** localStorage が使えない環境（プライベートウィンドウ等）でも落とさない */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readOffset(themeId: string, form: PromptForm): number {
  const raw = storage()?.getItem(keyOf(themeId, form));
  if (raw === null || raw === undefined) return 0;
  const value = Number.parseInt(raw, 10);
  // 壊れた値・負数は「最初から」に倒す。API に弾かれて遊べなくなるより良い
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function writeOffset(themeId: string, form: PromptForm, offset: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0) return;
  try {
    storage()?.setItem(keyOf(themeId, form), String(offset));
  } catch {
    // 容量超過・書き込み禁止。進捗が残らないだけでプレイは続けられる
  }
}
