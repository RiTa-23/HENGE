/**
 * 日次消費の窓（＝いつリセットされるか）。
 *
 * **区切りは 00:00 UTC。** Workers AI の無料枠（アカウント全体で1日10,000
 * ニューロン）が 00:00 UTC にリセットされるので、利用者ごとの上限も同じ窓で
 * 数える。ずらすと、1アカウント日の中に利用者のリセットが挟まり、**1人が
 * 上限の2倍まで消費できてしまう**（500×20人で10,000のはずが10人で埋まる）。
 *
 * **JSTに直さない。** 日本語話者向けのサービスなので直感的にはJST 0時だが、
 * 守りたいのはアカウント全体の枠の方で、そちらの窓は動かせない。利用者には
 * 「日本時間の朝9時」として見せる（`quotaResetAt`）。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日次消費のキー。`user_generation_usage.date` に使う `YYYY-MM-DD`（UTC基準） */
export function usageDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** 次にリセットされる時刻（次の 00:00 UTC）をUTCのDateで返す */
export function nextResetAt(date: Date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0),
  );
}

/**
 * リセット時刻を `+09:00` 付きのISO形式で返す。案内文で使う。
 *
 * **時刻そのものはUTC基準（次の 00:00 UTC）で、表記だけ日本時間にする。**
 * 00:00 UTC は日本時間の朝9時なので、利用者には「朝9時にリセット」と見える。
 * UTCのまま見せると、日本語話者には何時のことか分からない。
 */
export function quotaResetAt(date: Date = new Date()): string {
  const reset = nextResetAt(date);
  const jst = new Date(reset.getTime() + JST_OFFSET_MS);
  return `${jst.toISOString().slice(0, 19)}+09:00`;
}
