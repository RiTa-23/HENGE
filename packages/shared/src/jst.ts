/**
 * JST基準の日付。
 *
 * Workersの実行環境はUTCなので、`new Date().toISOString()` をそのまま使うと
 * 生成上限のリセットが日本時間の朝9時になる。日付を扱うときは必ずここを経由する。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JST基準の `YYYY-MM-DD`。`user_generation_usage.date` に使う。 */
export function toJstDateString(date: Date = new Date()): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 次にクォータがリセットされる時刻（JSTの翌0時）をUTCのDateで返す。
 * `QUOTA_EXCEEDED` の案内文で使う。
 */
export function nextJstMidnight(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  const startOfNextJstDay = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );
  return new Date(startOfNextJstDay - JST_OFFSET_MS);
}
