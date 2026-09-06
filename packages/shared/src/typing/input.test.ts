import { describe, expect, it } from "bun:test";
import { isImeKey, normalizeTypedKey } from "./input";
import { pressKey, startTyping } from "./match";
import { buildRomanCandidates } from "./build";

/**
 * **候補テーブルは小文字のASCIIしか持たない。** `KeyboardEvent.key` を素通しすると、
 * Caps Lock で `"S"` が来た瞬間に「正しく打っているのに全打鍵がミス」になる。
 * 画面上は原因が一切見えない壊れ方なので、ここで固定する。
 */
describe("normalizeTypedKey", () => {
  it.each(["a", "z", "s", "!", "?", ",", ".", "-"])("%p はそのまま受ける", (key) => {
    expect(normalizeTypedKey(key)).toBe(key);
  });

  it.each([
    ["S", "s"],
    ["A", "a"],
    ["Z", "z"],
  ])("大文字 %p は %p に倒す（Caps Lock / Shift）", (key, expected) => {
    expect(normalizeTypedKey(key)).toBe(expected);
  });

  it.each(["Shift", "Enter", "Backspace", "F1", "ArrowLeft", "Process", " ", ""])(
    "%p は打鍵ではない",
    (key) => {
      expect(normalizeTypedKey(key)).toBeNull();
    },
  );

  it.each(["し", "ア", "漢", "ー", "１", "＠"])("かな・漢字・全角の %p は打鍵ではない", (key) => {
    expect(normalizeTypedKey(key)).toBeNull();
  });
});

describe("isImeKey", () => {
  it.each(["し", "ア", "漢", "ー", "、", "Process", "Unidentified"])(
    "%p は日本語入力のままと判定する",
    (key) => {
      expect(isImeKey(key)).toBe(true);
    },
  );

  it.each(["a", "S", "!", "Shift", "Enter", "F1"])("%p はIMEのせいではない", (key) => {
    expect(isImeKey(key)).toBe(false);
  });
});

/**
 * 実際の打鍵経路。**正規化を挟めば Caps Lock でも普通に打てる**ことを、
 * エンジンまで通して確認する（正規化を外すと全打鍵がミスになる）。
 */
/** 画面（PlayScreen）と同じ手順で1文字ずつ流し込む */
function press(keys: string[]) {
  let progress = startTyping(buildRomanCandidates("しの"));
  for (const key of keys) {
    const typed = normalizeTypedKey(key);
    if (typed !== null) progress = pressKey(progress, typed);
  }
  return progress;
}

describe("正規化してから pressKey に渡す", () => {
  it("小文字で打てる", () => {
    const progress = press(["s", "i", "n", "o"]);

    expect(progress.finished).toBe(true);
    expect(progress.missCount).toBe(0);
  });

  it("Caps Lock（大文字）でも同じように打てる", () => {
    const progress = press(["S", "I", "N", "O"]);

    expect(progress.finished).toBe(true);
    expect(progress.missCount).toBe(0);
  });

  it("かなで届いた打鍵はミスに数えない", () => {
    const progress = press(["し", "の"]);

    expect(progress.missCount).toBe(0);
    expect(progress.hitCount).toBe(0);
    expect(progress.finished).toBe(false);
  });

  it("正規化しないと大文字が全部ミスになる（退行の再現）", () => {
    let progress = startTyping(buildRomanCandidates("しの"));
    for (const key of ["S", "I", "N", "O"]) progress = pressKey(progress, key);

    expect(progress.missCount).toBe(4);
    expect(progress.finished).toBe(false);
  });
});
