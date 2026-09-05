import { beforeEach, describe, expect, it } from "bun:test";
import { readOffset, writeOffset } from "./offset";

/**
 * bun のテスト環境には localStorage が無いので最小限の実装を置く。
 * offset.ts は呼ばれるたびに globalThis から取るので、ここで差し替えられる。
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => map.delete(key) as unknown as void,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage(),
    configurable: true,
  });
});

describe("匿名ユーザーのオフセット", () => {
  it("保存していなければ0（最初から）", () => {
    expect(readOffset("t1")).toBe(0);
  });

  it("書いた値を読み戻せる", () => {
    writeOffset("t1", 30);

    expect(readOffset("t1")).toBe(30);
  });

  it("テーマごとに別々に持つ", () => {
    writeOffset("t1", 15);
    writeOffset("t2", 45);

    expect(readOffset("t1")).toBe(15);
    expect(readOffset("t2")).toBe(45);
  });

  // 壊れた値で遊べなくなる方が損。読めなければ最初からにする
  it("壊れた値は0に倒す", () => {
    localStorage.setItem("henge:offset:t1", "にんじゃ");

    expect(readOffset("t1")).toBe(0);
  });

  it("負数は0に倒す", () => {
    localStorage.setItem("henge:offset:t1", "-15");

    expect(readOffset("t1")).toBe(0);
  });

  it("負数は書き込まない", () => {
    writeOffset("t1", 15);
    writeOffset("t1", -1);

    expect(readOffset("t1")).toBe(15);
  });

  it("他のキーを汚さない", () => {
    localStorage.setItem("unrelated", "keep");
    writeOffset("t1", 15);

    expect(localStorage.getItem("unrelated")).toBe("keep");
  });
});
