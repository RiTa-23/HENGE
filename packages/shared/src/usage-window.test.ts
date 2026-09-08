import { describe, expect, test } from "bun:test";
import { nextResetAt, quotaResetAt, usageDateKey } from "./usage-window";

/**
 * 窓の区切りは 00:00 UTC（Workers AI の無料枠と同じ）。**JSTの0時ではない。**
 * ここがずれると、1アカウント日の中に利用者のリセットが挟まり、1人が上限の
 * 2倍まで消費できてしまう。
 */
describe("usageDateKey", () => {
  test("00:00 UTC で日付が変わる", () => {
    expect(usageDateKey(new Date("2026-09-04T23:59:59Z"))).toBe("2026-09-04");
    expect(usageDateKey(new Date("2026-09-05T00:00:00Z"))).toBe("2026-09-05");
  });

  /** JST 0時（＝前日15:00 UTC）では変わらない。旧仕様との違いがここに出る */
  test("JSTの0時では日付が変わらない", () => {
    expect(usageDateKey(new Date("2026-09-04T14:59:59Z"))).toBe("2026-09-04");
    expect(usageDateKey(new Date("2026-09-04T15:00:00Z"))).toBe("2026-09-04");
  });

  test("年をまたぐ", () => {
    expect(usageDateKey(new Date("2025-12-31T23:59:59Z"))).toBe("2025-12-31");
    expect(usageDateKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});

describe("nextResetAt", () => {
  test("次の 00:00 UTC を返す", () => {
    expect(nextResetAt(new Date("2026-09-04T10:00:00Z")).toISOString()).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });

  test("00:00 UTC ちょうどなら、その日の終わり（翌0時）を返す", () => {
    expect(nextResetAt(new Date("2026-09-04T00:00:00Z")).toISOString()).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });
});

describe("quotaResetAt", () => {
  /**
   * **時刻はUTC基準のまま、表記だけ日本時間にする。** 00:00 UTC は日本時間の
   * 朝9時。UTCのまま見せると日本語話者には何時のことか分からない。
   */
  test("次の 00:00 UTC を、日本時間の朝9時として返す", () => {
    expect(quotaResetAt(new Date("2026-09-04T10:00:00Z"))).toBe("2026-09-05T09:00:00+09:00");
  });

  test("日本時間の深夜（＝前日のUTC夕方）でも、同じ日の朝9時を指す", () => {
    // JST 2026-09-05 03:00 = UTC 2026-09-04 18:00 → 次のリセットは JST 同日 09:00
    expect(quotaResetAt(new Date("2026-09-04T18:00:00Z"))).toBe("2026-09-05T09:00:00+09:00");
  });
});
