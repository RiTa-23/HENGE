import { describe, expect, test } from "bun:test";
import {
  PENDING_RANKING_TTL_MS,
  type PendingRanking,
  parsePendingRanking,
} from "./pending-ranking";

const NOW = 1_800_000_000_000;

const pending: PendingRanking = {
  themeId: "t1",
  form: "word",
  ticket: "body.signature",
  log: { keys: "neko", t: [100, 200, 300, 400] },
  score: 240,
  savedAt: NOW - 60_000,
};

const here = { themeId: "t1", form: "word" as const, now: NOW };

describe("parsePendingRanking", () => {
  test("このプールの、期限内の記録を読み戻す", () => {
    expect(parsePendingRanking(JSON.stringify(pending), here)).toEqual(pending);
  });

  test("別のテーマ・別の形式の記録は出さない", () => {
    const raw = JSON.stringify(pending);
    expect(parsePendingRanking(raw, { ...here, themeId: "t2" })).toBeNull();
    expect(parsePendingRanking(raw, { ...here, form: "sentence" })).toBeNull();
  });

  test("30分を過ぎた記録は出さない", () => {
    const old = { ...pending, savedAt: NOW - PENDING_RANKING_TTL_MS - 1 };
    expect(parsePendingRanking(JSON.stringify(old), here)).toBeNull();
  });

  test("無い・壊れた値は null（例外にしない）", () => {
    expect(parsePendingRanking(null, here)).toBeNull();
    expect(parsePendingRanking("{", here)).toBeNull();
    expect(parsePendingRanking(JSON.stringify({ ...pending, log: null }), here)).toBeNull();
  });
});
