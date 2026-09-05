import { describe, expect, it } from "bun:test";
import { isValidPreset, PRESETS, presetCreateHref } from "./presets";

/**
 * プリセットは運営が手で足すリストなので、**混入は静かに通る**。
 * カタカナや長音符「ー」を1つ足すと、画面上は普通のボタンに見えるのに、
 * 押した人だけが `VALIDATION_ERROR` に当たる（含む文字はひらがなのみ）。
 *
 * 検証規則は `lib/api/schema.ts` の `themeNameSchema`（constraint は1〜4文字＋
 * ひらがなのみ）と同じものをここでも見る。
 */
describe("プリセットはAPIの検証を通る形になっている", () => {
  it("空ではない", () => {
    expect(PRESETS.length).toBeGreaterThan(0);
  });

  it.each(PRESETS)("$char はひらがな1〜4文字", (preset) => {
    expect(isValidPreset(preset)).toBe(true);
  });

  it.each(PRESETS)("$char に説明が付いている", ({ reason }) => {
    expect(reason.trim().length).toBeGreaterThan(0);
  });

  it("重複が無い", () => {
    const chars = PRESETS.map((preset) => preset.char);

    expect(new Set(chars).size).toBe(chars.length);
  });
});

describe("isValidPreset は弾くべきものを弾く", () => {
  it.each([
    { char: "ー", reason: "長音符はカタカナブロック" },
    { char: "ザ", reason: "カタカナ" },
    { char: "座", reason: "漢字" },
    { char: "za", reason: "英字" },
    { char: "ざ ぎ", reason: "空白" },
    { char: "", reason: "空" },
    { char: "ざぎづぬへ", reason: "5文字" },
  ])("$char は不可（$reason）", (preset) => {
    expect(isValidPreset(preset)).toBe(false);
  });
});

describe("presetCreateHref", () => {
  it("作成フォームへ文字を渡す", () => {
    expect(presetCreateHref("ざ")).toBe(`/practice?char=${encodeURIComponent("ざ")}#create`);
  });
});
