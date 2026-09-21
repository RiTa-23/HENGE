import { describe, expect, it, vi } from "vitest";
import { createVibratoReadings } from "../src/reading/vibrato";
import { ReadingError } from "../src/reading/index";

/** 読み Worker の fetch を差し替える。実際の Service Binding はテスト環境に無い */
function stubReadingWorker(results: unknown, status = 200): Fetcher {
  return {
    fetch: vi.fn(async () => Response.json(status === 200 ? { results } : results, { status })),
  } as unknown as Fetcher;
}

describe("createVibratoReadings", () => {
  it("読み Worker の kana をひらがなとローマ字候補に組み立てる", async () => {
    const readings = createVibratoReadings(stubReadingWorker([{ kana: "しのびはやみをはしる。" }]));

    const [outcome] = await readings(["忍びは闇を走る。"]);
    if (!outcome?.ok) throw new Error("ok な結果であるべき");
    expect(outcome.reading.kana).toBe("しのびはやみをはしる。");
    expect(outcome.reading.roman.length).toBeGreaterThan(0);
  });

  it("UNKNOWN_READING は ok:false に変換する（呼び出し側はそのお題を却下）", async () => {
    const readings = createVibratoReadings(
      stubReadingWorker([{ kana: "にんじゃ" }, { error: "UNKNOWN_READING", surface: "滅" }]),
    );

    const [ok, ng] = await readings(["忍者", "鬼滅の刃"]);
    expect(ok?.ok).toBe(true);
    expect(ng).toEqual({ ok: false, error: "UNKNOWN_READING", surface: "滅" });
  });

  it("読みに打鍵テーブル外の文字が残っていれば UNKNOWN_READING に畳む", async () => {
    // 漢字のまま返る読みはテーブルに無い → UnsupportedKanaError 経由で却下扱い
    const readings = createVibratoReadings(stubReadingWorker([{ kana: "手裏剣" }]));

    const [outcome] = await readings(["手裏剣"]);
    expect(outcome).toEqual({ ok: false, error: "UNKNOWN_READING", surface: "手裏剣" });
  });

  it("HTTP エラーは ReadingError として投げる（お題単位の却下ではない）", async () => {
    const readings = createVibratoReadings(stubReadingWorker({}, 500));

    await expect(readings(["忍者"])).rejects.toThrow(ReadingError);
  });
});
