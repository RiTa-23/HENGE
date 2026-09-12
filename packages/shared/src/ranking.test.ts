import { describe, expect, it } from "bun:test";
import { MAX_KEYS_PER_SECOND, maxHits, minHits, playStatsRejection, RANKING_SIZE } from "./ranking";
import { PLAY_SIZE, PLAY_SIZE_WORD } from "./session";

describe("打鍵数の範囲", () => {
  it("短文は 15問 × 10〜35打鍵（上限は最短候補基準なので2倍）", () => {
    expect(minHits("sentence")).toBe(PLAY_SIZE * 10);
    expect(maxHits("sentence")).toBe(PLAY_SIZE * 35 * 2);
  });

  it("単語は 20問 × 4〜20打鍵", () => {
    expect(minHits("word")).toBe(PLAY_SIZE_WORD * 4);
    expect(maxHits("word")).toBe(PLAY_SIZE_WORD * 20 * 2);
  });

  it("長文は 1本 × 250〜450打鍵", () => {
    expect(minHits("long")).toBe(250);
    expect(maxHits("long")).toBe(450 * 2);
  });
});

describe("playStatsRejection", () => {
  const ok = { hits: 300, misses: 10, elapsedMs: 60_000 };

  it("普通の記録は通す", () => {
    expect(playStatsRejection(ok, "sentence")).toBeNull();
  });

  it("時間が0以下・1時間超は弾く", () => {
    expect(playStatsRejection({ ...ok, elapsedMs: 0 }, "sentence")).not.toBeNull();
    expect(playStatsRejection({ ...ok, elapsedMs: 60 * 60 * 1000 + 1 }, "sentence")).not.toBeNull();
  });

  it("問題数 × 下限に満たない打鍵数は弾く（打っていない）", () => {
    expect(playStatsRejection({ ...ok, hits: minHits("sentence") - 1 }, "sentence")).not.toBeNull();
    expect(playStatsRejection({ ...ok, hits: minHits("word") - 1 }, "word")).not.toBeNull();
  });

  it("上限の2倍を超える打鍵数は弾く", () => {
    expect(playStatsRejection({ ...ok, hits: maxHits("sentence") + 1 }, "sentence")).not.toBeNull();
  });

  it("1秒あたりの打鍵数が上限を超える記録は弾く", () => {
    const tooFast = { hits: 300, misses: 0, elapsedMs: (300 / (MAX_KEYS_PER_SECOND + 1)) * 1000 };
    expect(playStatsRejection(tooFast, "sentence")).not.toBeNull();
  });

  it("形式で範囲が変わる（短文の下限は単語では上限側に寄る）", () => {
    // 短文として最小の150打鍵は、単語（80〜800）でも通る
    expect(playStatsRejection({ ...ok, hits: 150 }, "word")).toBeNull();
    // 単語として最小の80打鍵は短文では足りない
    expect(playStatsRejection({ ...ok, hits: 80 }, "sentence")).not.toBeNull();
  });

  it("保持する件数は100", () => {
    expect(RANKING_SIZE).toBe(100);
  });
});
