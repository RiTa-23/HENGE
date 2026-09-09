import { buildRomanCandidates, countKeystrokes } from "@henge/shared";
import { describe, expect, it } from "vitest";
import {
  planRebuild,
  sqlText,
  type StoredPrompt,
  updateStatement,
} from "../scripts/rebuild-roman-plan";

/**
 * `table.ts` を変えたあとの作り直し。**書く行の選び方だけを固定する。**
 *
 * ローマ字候補そのものの正しさは packages/shared 側で見ているので、ここでは見ない。
 */

/** いまのテーブルで作った、正しい状態の行 */
function current(id: string, kana: string): StoredPrompt {
  const roman = buildRomanCandidates(kana);
  return {
    id,
    readingKana: kana,
    readingRomanJson: JSON.stringify(roman),
    keystrokeCount: countKeystrokes(roman),
  };
}

describe("planRebuild", () => {
  /**
   * **一致する行を書かないことが、この道具の肝。** D1の書き込みは1日10万行で、
   * 使い切るとその日はD1へのクエリが全部落ちる。全行を書き直す実装に戻ると、
   * お題が増えたときにスクリプトがサービスを止める。
   */
  it("いまの値と一致する行は書かない", () => {
    const plan = planRebuild([current("p1", "しのび"), current("p2", "にんじゃ")]);

    expect(plan.changed).toEqual([]);
    expect(plan.unchanged).toBe(2);
    expect(plan.scanned).toBe(2);
  });

  /** 「ちぇ」を足す前に作られた行。ち＋ぇに分解されたまま保存されている */
  it("古いテーブルで作られた行を拾い、新しい候補と打鍵数を返す", () => {
    const stale: StoredPrompt = {
      id: "p1",
      readingKana: "ちぇっく",
      readingRomanJson: JSON.stringify([["chi", "ti"], ["xe", "le"], ["k"], ["ku"]]),
      keystrokeCount: 8,
    };

    const plan = planRebuild([stale]);

    expect(plan.changed).toHaveLength(1);
    expect(plan.changed[0]?.id).toBe("p1");
    expect(JSON.parse(plan.changed[0]?.readingRomanJson ?? "[]")[0]).toContain("che");
    expect(plan.changed[0]?.previousKeystrokeCount).toBe(8);
    expect(plan.changed[0]?.keystrokeCount).toBe(countKeystrokes(buildRomanCandidates("ちぇっく")));
  });

  /**
   * **候補が同じでも打鍵数だけずれている行を取りこぼさない。** 片方だけ直すと、
   * 画面に出る打鍵数と実際の打鍵数が食い違ったまま残る。
   */
  it("打鍵数だけが古い行も拾う", () => {
    const row = { ...current("p1", "しのび"), keystrokeCount: 99 };

    const plan = planRebuild([row]);

    expect(plan.changed).toHaveLength(1);
    expect(plan.changed[0]?.keystrokeCount).toBe(6);
  });

  /**
   * テーブルからかなを消した場合。**打てないお題なので書き換えない**（消すかどうかは人が決める）。
   * ここで例外を投げると、1行のせいで全体が止まる。
   */
  it("テーブルに無いかなを含む行は、書き換えずに報告する", () => {
    const plan = planRebuild([
      { id: "p1", readingKana: "しのびA", readingRomanJson: "[]", keystrokeCount: 6 },
      current("p2", "しのび"),
    ]);

    expect(plan.changed).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.unsupported).toEqual([{ id: "p1", readingKana: "しのびA", missingKana: "A" }]);
  });

  /** 範囲外は**報告するが書き換えはする**。古い値も同じだけ間違っているため */
  it("打鍵数が範囲外に落ちる行に印を付ける", () => {
    const short = { ...current("p1", "しのび"), keystrokeCount: 1 };

    const plan = planRebuild([short]);

    expect(plan.changed[0]?.outOfRange).toBe(true);
  });

  it("範囲内なら印は付かない", () => {
    const row = { ...current("p1", "にんじゃがつきをほえる"), keystrokeCount: 1 };

    expect(planRebuild([row]).changed[0]?.outOfRange).toBe(false);
  });
});

describe("SQLの組み立て", () => {
  /** 組み立てた文をそのままD1へ投げるので、引用符の扱いを固定する */
  it("単引用符を二重にする", () => {
    expect(sqlText("it's")).toBe("'it''s'");
  });

  it("UPDATE は候補と打鍵数の両方を、同じ文で書き換える", () => {
    const sql = updateStatement({
      id: "p1",
      readingKana: "しのび",
      readingRomanJson: '[["shi"]]',
      keystrokeCount: 6,
      previousKeystrokeCount: 8,
      outOfRange: false,
    });

    expect(sql).toContain("reading_roman_json = '[[\"shi\"]]'");
    expect(sql).toContain("keystroke_count = 6");
    expect(sql).toContain("WHERE id = 'p1'");
    // 読みは触らない。読みは正しく、そこから作り直している
    expect(sql).not.toContain("reading_kana");
  });
});
