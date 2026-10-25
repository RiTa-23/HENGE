import { describe, expect, it } from "bun:test";
import { fingerLabel, fingerOf, fingerPlan } from "./fingers";

/** `Keyboard` に並んでいるキー（Shift を除く）。どれも指が決まっていること */
const KEYS = [..."1234567890-", ..."QWERTYUIOP", ..."ASDFGHJKL", ..."ZXCVBNM,./"];

describe("fingerOf", () => {
  // 指が出ないキーがあると、そのキーのときだけ手の図が空になる。画面からは気付きにくい
  it.each(KEYS)("%s には押す指がある", (key) => {
    expect(fingerOf(key)).not.toBeNull();
  });

  it.each([
    ["F", "left", "index"],
    ["J", "right", "index"],
    ["G", "left", "index"],
    ["H", "right", "index"],
    ["A", "left", "pinky"],
    ["S", "left", "ring"],
    ["D", "left", "middle"],
    ["K", "right", "middle"],
    ["L", "right", "ring"],
    ["P", "right", "pinky"],
    ["-", "right", "pinky"],
    [",", "right", "middle"],
    [".", "right", "ring"],
    ["/", "right", "pinky"],
    ["1", "left", "pinky"],
  ])("%s は %s の %s", (key, hand, finger) => {
    expect(fingerOf(key)).toEqual({ hand, finger } as never);
  });

  // 表示は大文字（Keyboard の ROWS）。小文字が来たら呼び出し側の間違い
  it("キーボードに無いキーは null", () => {
    expect(fingerOf("a")).toBeNull();
    expect(fingerOf("Shift")).toBeNull();
  });
});

describe("fingerPlan", () => {
  it("Shift が要らなければ押す指だけ", () => {
    expect(fingerPlan("K", false)).toEqual({
      press: { hand: "right", finger: "middle" },
      shift: null,
    });
  });

  // 同じ手の小指で Shift と 1 は押せない
  it("！（Shift+1）は右の小指で Shift", () => {
    expect(fingerPlan("1", true)).toEqual({
      press: { hand: "left", finger: "pinky" },
      shift: { hand: "right", finger: "pinky" },
    });
  });

  it("？（Shift+/）は左の小指で Shift", () => {
    expect(fingerPlan("/", true)).toEqual({
      press: { hand: "right", finger: "pinky" },
      shift: { hand: "left", finger: "pinky" },
    });
  });
});

describe("fingerLabel", () => {
  it("手と指を並べる", () => {
    expect(fingerLabel({ hand: "left", finger: "index" })).toBe("左 人差し指");
    expect(fingerLabel({ hand: "right", finger: "pinky" })).toBe("右 小指");
  });
});
