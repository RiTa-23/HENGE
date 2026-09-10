import { beforeEach, describe, expect, it } from "bun:test";
import { readMuted, writeMuted } from "./sound";

/**
 * bun のテスト環境には localStorage が無いので最小限の実装を置く
 * （offset.test.ts と同じ理由・同じ形）。
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

describe("効果音の消音設定", () => {
  // 既定で消えていると、音を付けたこと自体が伝わらない
  it("何も保存していなければ鳴る", () => {
    expect(readMuted()).toBe(false);
  });

  it("消音を覚える", () => {
    writeMuted(true);

    expect(readMuted()).toBe(true);
  });

  it("消音を解いた状態も覚える", () => {
    writeMuted(true);
    writeMuted(false);

    expect(readMuted()).toBe(false);
  });

  // 壊れた値で無音になると、原因が画面から見えない
  it("読めない値は鳴る側に倒す", () => {
    localStorage.setItem("henge:muted", "にんじゃ");

    expect(readMuted()).toBe(false);
  });
});
