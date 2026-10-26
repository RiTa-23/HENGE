import { describe, expect, it } from "bun:test";
import { isPlayStartSpace, isStartSpace } from "./shortcut";

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

describe("isPlayStartSpace", () => {
  const ready = { key: " ", code: "Space", isComposing: false, targetIsTextEntry: false };

  it("入力欄の外の Space は開始にする（ボタンにフォーカスがあっても）", () => {
    expect(isPlayStartSpace(ready)).toBe(true);
    expect(isPlayStartSpace({ ...ready, key: "" })).toBe(true);
  });

  // 運指の投稿の説明文を書いている途中で始まると、入力が消える
  it("入力欄にフォーカスがあるときは奪わない", () => {
    expect(isPlayStartSpace({ ...ready, targetIsTextEntry: true })).toBe(false);
  });

  it("日本語入力の変換中（Space で変換）は奪わない", () => {
    expect(isPlayStartSpace({ ...ready, key: "Process", isComposing: true })).toBe(false);
  });

  it("Space 以外は拾わない", () => {
    expect(isPlayStartSpace({ ...ready, key: "a", code: "KeyA" })).toBe(false);
  });
});
