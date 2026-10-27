import { describe, expect, test } from "bun:test";
import { buildRomanCandidates, etypingScore, type PlayLog, replayPlay } from "./index";

/** 打鍵ごとに100msずつ進む打鍵ログ */
function logOf(keys: string, step = 100): PlayLog {
  return { keys, t: [...keys].map((_, i) => (i + 1) * step) };
}

const prompts = [buildRomanCandidates("かんじ"), buildRomanCandidates("ねこ")];

describe("replayPlay", () => {
  test("打ち切ったログから、打鍵数・ミス数・最後の打鍵の時刻を出す", () => {
    const result = replayPlay(prompts, logOf("kanjineko"));
    expect(result).toEqual({ stats: { hits: 9, misses: 0, elapsedMs: 900 } });
  });

  test("候補のどれで打っても同じように受理する（ん を nn、じ を zi）", () => {
    const result = replayPlay(prompts, logOf("kannzineko"));
    expect(result).toEqual({ stats: { hits: 10, misses: 0, elapsedMs: 1000 } });
  });

  test("ミスは数えるが巻き戻さない（画面と同じ判定）", () => {
    // か の後と ね の後に q を押し間違え、打ち直して続ける
    const result = replayPlay(prompts, logOf("kaqnjineqko"));
    expect(result).toEqual({ stats: { hits: 9, misses: 2, elapsedMs: 1100 } });
  });

  test("スコアは再生した値から計算できる", () => {
    const result = replayPlay(prompts, logOf("kanjineko", 1000));
    if (!("stats" in result)) throw new Error("弾かれた");
    // 9打鍵・9秒・ミス0 → 60 WPM
    expect(etypingScore(result.stats)).toBe(60);
  });

  test("最後まで打っていなければ弾く", () => {
    expect(replayPlay(prompts, logOf("kanjine"))).toHaveProperty("rejection");
  });

  test("打ち終えた後にキーが残っていれば弾く", () => {
    expect(replayPlay(prompts, logOf("kanjinekoa"))).toHaveProperty("rejection");
  });

  test("別のお題のログは通らない", () => {
    const other = [buildRomanCandidates("いぬ"), buildRomanCandidates("とり")];
    expect(replayPlay(other, logOf("kanjineko"))).toHaveProperty("rejection");
  });

  test("キーと時刻の数が違えば弾く", () => {
    expect(replayPlay(prompts, { keys: "kanjineko", t: [1, 2, 3] })).toHaveProperty("rejection");
  });

  test("時刻が戻る・負・小数なら弾く", () => {
    const base = logOf("kanjineko").t;
    const rewound = base.map((time, i) => (i === 5 ? 1 : time));
    expect(replayPlay(prompts, { keys: "kanjineko", t: rewound })).toHaveProperty("rejection");
    const negative = base.map((time, i) => (i === 0 ? -1 : time));
    expect(replayPlay(prompts, { keys: "kanjineko", t: negative })).toHaveProperty("rejection");
    const fractional = base.map((time, i) => (i === 3 ? time + 0.5 : time));
    expect(replayPlay(prompts, { keys: "kanjineko", t: fractional })).toHaveProperty("rejection");
  });

  test("同じ時刻の打鍵は許す（同時押しは同じミリ秒に入りうる）", () => {
    const t = logOf("kanjineko").t.map((time, i) => (i === 1 ? 100 : time));
    expect(replayPlay(prompts, { keys: "kanjineko", t })).toHaveProperty("stats");
  });
});
