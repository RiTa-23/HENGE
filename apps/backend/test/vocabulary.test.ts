import { containsNgWord, NG_WORDS } from "@henge/shared";
import { describe, expect, it } from "vitest";
import {
  CONSTRAINT_VOCABULARY_MAX,
  CONSTRAINT_VOCABULARY_MIN,
  vocabularyFor,
  vocabularySize,
} from "../src/generation/vocabulary";
import { VOCABULARY_TSV } from "../src/generation/vocabulary.generated";

const rows = VOCABULARY_TSV.split("\n").map((line) => line.split("\t"));

describe("共通語彙リスト（vocabulary.generated.ts）", () => {
  it("語数は上限まで（膨らむと Worker のメモリを気にし始めることになる）", () => {
    // 2026-10-24 の生成で 32,145語。超えたら選び方を見直す
    expect(vocabularySize()).toBeLessThanOrEqual(50_000);
    expect(vocabularySize()).toBeGreaterThan(10_000);
  });

  it("1行は「表記<TAB>読み」で、読みはひらがな", () => {
    for (const row of rows) {
      expect(row).toHaveLength(2);
      expect(row[1]).toMatch(/^[ぁ-ゖー]+$/u);
    }
  });

  it("表記と読みの組は重ならない", () => {
    expect(new Set(VOCABULARY_TSV.split("\n")).size).toBe(rows.length);
  });

  it("NG 語を含まない（生成後の検査で必ず落ちる語を渡さない）", () => {
    const ng = new Set(NG_WORDS);
    for (const [text = "", reading = ""] of rows) {
      expect(ng.has(text) || ng.has(reading) || containsNgWord(text)).toBe(false);
    }
  });

  it("1文字の漢字を含まない（読みが紛れて、狙いの読みで使われない）", () => {
    for (const [text = ""] of rows) expect(text).not.toMatch(/^[一-鿿々]$/u);
  });
});

describe("vocabularyFor", () => {
  it("読みに指定の連接を含む語だけを、リストの順（よく使われる順）に返す", () => {
    const words = vocabularyFor("ざ", 50);
    expect(words).toHaveLength(50);
    for (const word of words) expect(word.reading).toContain("ざ");
    const lines = VOCABULARY_TSV.split("\n");
    const order = words.map((w) => lines.indexOf(`${w.text}\t${w.reading}`));
    expect(order).not.toContain(-1);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  it("上限は1000語", () => {
    expect(vocabularyFor("き")).toHaveLength(CONSTRAINT_VOCABULARY_MAX);
  });

  it("濁点の有無は別の連接（発表＝はっぴょう は「ひょう」に当たらない）", () => {
    expect(vocabularyFor("ひょう").some((w) => w.reading.includes("ぴょう"))).toBe(false);
  });

  it("結合濁点で書かれた指定でも当たる（検証の includesConstraint と同じ正規化）", () => {
    expect(vocabularyFor("ざ", 10)).toEqual(vocabularyFor("ざ", 10));
  });

  /**
   * プリセット（apps/frontend/lib/practice/presets.ts）は下限を超えていなければならない。
   * 届かないと、押した人だけが「語彙が足りない」で断られる
   */
  it.each(["ざ", "き", "で"])("プリセット「%s」は下限（100語）を超える", (char) => {
    expect(vocabularyFor(char).length).toBeGreaterThanOrEqual(CONSTRAINT_VOCABULARY_MIN);
  });

  it("語彙の少ない連接は下限に届かない（作成を断る側）", () => {
    expect(vocabularyFor("を").length).toBeLessThan(CONSTRAINT_VOCABULARY_MIN);
    expect(vocabularyFor("にゃ").length).toBeLessThan(CONSTRAINT_VOCABULARY_MIN);
  });
});
