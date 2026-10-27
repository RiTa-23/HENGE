import { describe, expect, test } from "bun:test";
import {
  buildRomanCandidates,
  PLAY_SIZE_WORD,
  type PlayLog,
  type ReplayPrompt,
} from "@henge/shared";
import { checkPlayRecord } from "./play-record";
import type { PlayTicket } from "./play-ticket";

const NOW = 1_800_000_000_000;

/** 単語の1プレイ（20問）。どれも「ねこ」 */
const prompts: ReplayPrompt[] = Array.from({ length: PLAY_SIZE_WORD }, (_, i) => ({
  id: `p${i}`,
  themeId: "t1",
  form: "word",
  readingRoman: buildRomanCandidates("ねこ"),
}));

const ticket: PlayTicket = {
  v: 1,
  jti: "j1",
  themeId: "t1",
  form: "word",
  promptIds: prompts.map((prompt) => prompt.id),
  iat: NOW - 120_000,
};

/** 全問を `neko` で打つ。1打鍵 200ms（80打鍵で16秒） */
function fullLog(step = 200): PlayLog {
  const keys = "neko".repeat(PLAY_SIZE_WORD);
  return { keys, t: [...keys].map((_, i) => (i + 1) * step) };
}

describe("checkPlayRecord", () => {
  test("お題を打ち切ったログから、再生した記録を返す", () => {
    expect(checkPlayRecord({ ticket, log: fullLog(), prompts, now: NOW })).toEqual({
      stats: { hits: 80, misses: 0, elapsedMs: 16_000 },
    });
  });

  test("お題が消されていれば NOT_FOUND", () => {
    const result = checkPlayRecord({ ticket, log: fullLog(), prompts: prompts.slice(1), now: NOW });
    expect(result).toHaveProperty("code", "NOT_FOUND");
  });

  test("別のテーマのお題は使えない（IDが同じでも）", () => {
    const other = prompts.map((prompt) => ({ ...prompt, themeId: "t2" }));
    const result = checkPlayRecord({ ticket, log: fullLog(), prompts: other, now: NOW });
    expect(result).toHaveProperty("code", "NOT_FOUND");
  });

  test("最後まで打っていないログは弾く", () => {
    const log = fullLog();
    const cut = { keys: log.keys.slice(0, -1), t: log.t.slice(0, -1) };
    expect(checkPlayRecord({ ticket, log: cut, prompts, now: NOW })).toHaveProperty(
      "code",
      "VALIDATION_ERROR",
    );
  });

  test("打っていないと分かる速さは弾く（playStatsRejection）", () => {
    // 80打鍵を1ms刻み → 1000打鍵/秒
    expect(checkPlayRecord({ ticket, log: fullLog(1), prompts, now: NOW })).toEqual({
      code: "VALIDATION_ERROR",
      message: "打鍵速度が範囲外です",
    });
  });

  test("発行から今までより長くかかった記録は弾く（実時間の検査）", () => {
    // 発行から10秒しか経っていないのに、16秒かけたと言うログ
    expect(
      checkPlayRecord({
        ticket: { ...ticket, iat: NOW - 10_000 },
        log: fullLog(),
        prompts,
        now: NOW,
      }),
    ).toEqual({ code: "VALIDATION_ERROR", message: "打鍵の記録が実際の時間と合いません" });
  });
});
