import { describe, expect, it } from "bun:test";
import { isStartSpace } from "./shortcut";

const space = {
  key: " ",
  code: "Space",
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  targetIsInteractive: false,
};

describe("isStartSpace", () => {
  it("ページのどこにもフォーカスが無いときの Space は開始にする", () => {
    expect(isStartSpace(space)).toBe(true);
  });

  it("key が空でも code が Space なら拾う（配列・IMEの状態による）", () => {
    expect(isStartSpace({ ...space, key: "" })).toBe(true);
  });

  it("Space 以外は拾わない", () => {
    expect(isStartSpace({ ...space, key: "Enter", code: "Enter" })).toBe(false);
  });

  it("ボタン・入力欄・リンクにフォーカスがあるときは、その要素の操作として奪わない", () => {
    expect(isStartSpace({ ...space, targetIsInteractive: true })).toBe(false);
  });

  it("押しっぱなしの連続は拾わない", () => {
    expect(isStartSpace({ ...space, repeat: true })).toBe(false);
  });

  it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"] as const)(
    "%s との同時押しは拾わない（Shift+Space の上スクロールなどを奪わない）",
    (modifier) => {
      expect(isStartSpace({ ...space, [modifier]: true })).toBe(false);
    },
  );
});
