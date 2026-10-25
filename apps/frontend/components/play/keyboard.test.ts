import { describe, expect, it } from "bun:test";
import { keyState, ROWS, toNextKey } from "./Keyboard";

/**
 * ハイライトが複数キーに及ぶのは修飾キー（`！` → `Shift` と `1`）だけで、
 * 両方同時に押す意味になる。候補違い（`ふ` → `F` と `H`）は、画面に出ている
 * 打ち方の1文字だけを光らせる。
 *
 * ここで固定するのは修飾キーの判定。アルファベット3段だけでは `！` `？` `ー` が
 * 打てないので、数字段と Shift を出す必要がある。
 */
describe("toNextKey", () => {
  it.each(["a", "k", "z"])("英字 %s は大文字のキー、Shiftは不要", (letter) => {
    expect(toNextKey(letter)).toEqual({ key: letter.toUpperCase(), shift: false });
  });

  it.each([",", ".", "-", "/"])("記号 %s はそのままのキーで、Shiftは不要", (symbol) => {
    expect(toNextKey(symbol)).toEqual({ key: symbol, shift: false });
  });

  it("！ は Shift + 1", () => {
    expect(toNextKey("!")).toEqual({ key: "1", shift: true });
  });

  it("？ は Shift + /", () => {
    expect(toNextKey("?")).toEqual({ key: "/", shift: true });
  });
});

/**
 * キーボードで光らせる Shift は、押すキーと反対側の1つだけ（運指ガイドと同じ）。
 * 両方光ると「反対の手の小指で Shift」という案内と食い違う。
 */
describe("keyState の Shift", () => {
  it("！（Shift+1）は右の Shift だけ光る", () => {
    const next = toNextKey("!");

    expect(keyState("ShiftRight", next, null)).toBe("modifier");
    expect(keyState("ShiftLeft", next, null)).toBe("idle");
  });

  it("？（Shift+/）は左の Shift だけ光る", () => {
    const next = toNextKey("?");

    expect(keyState("ShiftLeft", next, null)).toBe("modifier");
    expect(keyState("ShiftRight", next, null)).toBe("idle");
  });

  it("Shift の要らない文字ではどちらも光らない", () => {
    const next = toNextKey("a");

    expect(keyState("ShiftLeft", next, null)).toBe("idle");
    expect(keyState("ShiftRight", next, null)).toBe("idle");
  });

  // 左右は名前で決める。並びに左右の Shift が揃っていないと、片側が光らなくなる
  it("並びの最下段の左端が左の Shift、右端が右の Shift", () => {
    const bottom = ROWS.at(-1) ?? [];

    expect(bottom.at(0)).toBe("ShiftLeft");
    expect(bottom.at(-1)).toBe("ShiftRight");
  });
});

describe("keyState の次のキーとミス", () => {
  it("次に打つキーは next", () => {
    expect(keyState("A", toNextKey("a"), null)).toBe("next");
  });

  it("直前に打ち間違えたキーは miss", () => {
    expect(keyState("J", toNextKey("a"), "J")).toBe("miss");
  });

  // 赤が消える前にそのキーが次に打つキーになったら、橙を優先する（docs/07-ui.md）
  it("打ち間違えたキーが次に打つキーでもあれば next を優先する", () => {
    expect(keyState("H", toNextKey("h"), "H")).toBe("next");
  });
});
