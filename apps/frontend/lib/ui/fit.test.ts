import { describe, expect, test } from "bun:test";
import { fitScale } from "./fit";

describe("fitScale", () => {
  test("収まるなら縮めない（拡大もしない）", () => {
    expect(fitScale(600, 800)).toBe(1);
  });

  test("はみ出すぶんだけ縮める", () => {
    expect(fitScale(1000, 800)).toBe(0.8);
  });

  test("測れないとき（0）は縮めない", () => {
    expect(fitScale(0, 800)).toBe(1);
    expect(fitScale(1000, 0)).toBe(1);
  });

  test("同じ画面の大きさのあいだは、前より大きく戻さない", () => {
    // 背の高い問題のあとに背の低い問題が来ても、文字の大きさを揺らさない
    expect(fitScale(800, 800, 0.8)).toBe(0.8);
    expect(fitScale(1600, 800, 0.8)).toBe(0.5);
  });
});
