import { describe, expect, it } from "bun:test";
import { DAILY_GENERATION_LIMIT } from "./session";
import { canGenerate, remainingQuota } from "./quota";

describe("remainingQuota", () => {
  it("上限から当日の回数を引いた残数を返す", () => {
    expect(remainingQuota(0)).toBe(DAILY_GENERATION_LIMIT);
    expect(remainingQuota(49)).toBe(1);
  });

  it("上限に達していれば0", () => {
    expect(remainingQuota(DAILY_GENERATION_LIMIT)).toBe(0);
  });

  it("上限を超えていてもマイナスにならない（並行リクエストのずれ込み対策）", () => {
    // 判定と加算の間に別リクエストが加算すると、count が上限を超えうる。
    // マイナスの残数を UI やレスポンスに漏らさない
    expect(remainingQuota(DAILY_GENERATION_LIMIT + 1)).toBe(0);
  });
});

describe("canGenerate", () => {
  it("残数があれば許可する", () => {
    expect(canGenerate(0)).toBe(true);
    expect(canGenerate(DAILY_GENERATION_LIMIT - 1)).toBe(true);
  });

  it("残数0なら許可しない（バックグラウンド補充もキックしない）", () => {
    expect(canGenerate(DAILY_GENERATION_LIMIT)).toBe(false);
    // 上限超過（並行ずれ込み）でも許可しない
    expect(canGenerate(DAILY_GENERATION_LIMIT + 1)).toBe(false);
  });
});
