import { describe, expect, test } from "bun:test";
import { nextJstMidnight, toJstDateString } from "./index";

describe("toJstDateString", () => {
  test("JSTの日付境界で切り替わる（UTCの0時ではない）", () => {
    // UTC 14:59:59 = JST 当日 23:59:59
    expect(toJstDateString(new Date("2026-09-04T14:59:59Z"))).toBe("2026-09-04");
    // UTC 15:00:00 = JST 翌日 00:00:00
    expect(toJstDateString(new Date("2026-09-04T15:00:00Z"))).toBe("2026-09-05");
  });

  test("UTCの日付をそのまま使っていない", () => {
    // これがJSTの朝9時。素直にtoISOString()を使うとここで日付が変わってしまう
    expect(toJstDateString(new Date("2026-09-04T00:00:00Z"))).toBe("2026-09-04");
    expect(toJstDateString(new Date("2026-09-03T23:00:00Z"))).toBe("2026-09-04");
  });

  test("年をまたぐ境界", () => {
    expect(toJstDateString(new Date("2025-12-31T14:59:59Z"))).toBe("2025-12-31");
    expect(toJstDateString(new Date("2025-12-31T15:00:00Z"))).toBe("2026-01-01");
  });

  test("YYYY-MM-DD の形式で返す", () => {
    expect(toJstDateString(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("nextJstMidnight", () => {
  test("次のJST0時をUTCで返す", () => {
    // JST 2026-09-04 19:00 → 次のリセットは JST 2026-09-05 00:00 = UTC 09-04 15:00
    expect(nextJstMidnight(new Date("2026-09-04T10:00:00Z")).toISOString()).toBe(
      "2026-09-04T15:00:00.000Z",
    );
  });

  test("JST0時ちょうどでも「次の」0時を返す", () => {
    expect(nextJstMidnight(new Date("2026-09-04T15:00:00Z")).toISOString()).toBe(
      "2026-09-05T15:00:00.000Z",
    );
  });

  test("返す時刻は必ず翌JST日の始まりになっている", () => {
    const now = new Date("2026-12-31T16:00:00Z"); // JST 2027-01-01 01:00
    expect(nextJstMidnight(now).toISOString()).toBe("2027-01-01T15:00:00.000Z");
  });
});
