import { describe, expect, it } from "bun:test";
import { toNextKey } from "./Keyboard";

/**
 * ハイライトが複数キーに及ぶ意味は2つある。**同じ見た目にすると誤解を招く。**
 *
 * - 候補違い（`ふ` → `F` と `H`）: どちらか一方を押す
 * - 修飾キー（`！` → `Shift` と `1`）: 両方同時に押す
 *
 * ここで固定するのは後者の判定。アルファベット3段だけでは `！` `？` `ー` が
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
