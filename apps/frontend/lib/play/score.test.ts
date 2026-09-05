import { describe, expect, it } from "bun:test";
import { accuracyRatio, etypingScore, keysPerSecond, type PlayStats } from "./score";

/** 60秒で total 打鍵、そのうち misses 回ミス */
function inOneMinute(total: number, misses: number): PlayStats {
  return { hits: total - misses, misses, elapsedMs: 60_000 };
}

describe("keysPerSecond", () => {
  // 分あたりに直すと e-typing の WPM になる。分子はミスを含む総打鍵数
  it("ミスを含めた総打鍵数を秒で割る", () => {
    expect(keysPerSecond({ hits: 90, misses: 10, elapsedMs: 10_000 })).toBe(10);
  });

  it("時間が0なら0（0除算にしない）", () => {
    expect(keysPerSecond({ hits: 10, misses: 0, elapsedMs: 0 })).toBe(0);
  });
});

describe("accuracyRatio", () => {
  it("正確に打てた数 ÷ 総打鍵数", () => {
    expect(accuracyRatio({ hits: 90, misses: 10, elapsedMs: 1000 })).toBeCloseTo(0.9);
  });

  it("打鍵が無ければ1", () => {
    expect(accuracyRatio({ hits: 0, misses: 0, elapsedMs: 0 })).toBe(1);
  });
});

describe("etypingScore", () => {
  // e-typing の算出方法の解説にある例。WPM350・正確率90% → 255
  it("WPM350・正確率90%で255", () => {
    expect(etypingScore(inOneMinute(350, 35))).toBe(255);
  });

  it("WPM200・正確率95%で171", () => {
    // 200 × 0.95^3 = 171.475 → 切り捨てて171
    expect(etypingScore(inOneMinute(200, 10))).toBe(171);
  });

  it("ノーミスならスコアはWPMそのもの", () => {
    expect(etypingScore(inOneMinute(300, 0))).toBe(300);
  });

  // 正確率が3乗で効くので、速さより正確さの影響が大きい
  it("速さが同じでも正確率が落ちると大きく下がる", () => {
    const accurate = etypingScore(inOneMinute(300, 15));
    const sloppy = etypingScore(inOneMinute(300, 60));

    expect(accurate).toBe(257);
    expect(sloppy).toBe(153);
  });

  it("小数点以下は切り捨てる", () => {
    // 100 × 0.99^3 = 97.0299 → 97
    expect(etypingScore(inOneMinute(100, 1))).toBe(97);
  });

  it("打鍵が無ければ0", () => {
    expect(etypingScore({ hits: 0, misses: 0, elapsedMs: 0 })).toBe(0);
  });
});
