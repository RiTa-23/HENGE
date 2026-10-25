import { beforeEach, describe, expect, it } from "bun:test";
import {
  readFingerGuide,
  readMuted,
  readRomanUpper,
  writeFingerGuide,
  writeMuted,
  writeRomanUpper,
} from "./prefs";

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

describe("運指ガイドの表示設定", () => {
  // 既定で隠すと、指が出せること自体が伝わらない
  it("何も保存していなければ出す", () => {
    expect(readFingerGuide()).toBe(true);
  });

  it("隠したことを覚える", () => {
    writeFingerGuide(false);

    expect(readFingerGuide()).toBe(false);
  });

  it("出す側に戻したことも覚える", () => {
    writeFingerGuide(false);
    writeFingerGuide(true);

    expect(readFingerGuide()).toBe(true);
  });

  it("読めない値は出す側に倒す", () => {
    localStorage.setItem("henge:finger-guide", "にんじゃ");

    expect(readFingerGuide()).toBe(true);
  });
});

describe("ローマ字の大文字表示の設定", () => {
  // これまでの表示（小文字）を既定に保つ
  it("何も保存していなければ小文字", () => {
    expect(readRomanUpper()).toBe(false);
  });

  it("大文字にしたことを覚える", () => {
    writeRomanUpper(true);

    expect(readRomanUpper()).toBe(true);
  });

  it("読めない値は小文字に倒す", () => {
    localStorage.setItem("henge:roman-upper", "にんじゃ");

    expect(readRomanUpper()).toBe(false);
  });
});
