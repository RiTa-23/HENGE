import { describe, expect, test } from "bun:test";
import {
  isHiraganaOnly,
  normalizeConstraintChar,
  normalizeName,
  normalizeThemeName,
} from "./index";

describe("normalizeThemeName", () => {
  test("NFKCで全角英数を半角に揃え、英字を小文字化する", () => {
    expect(normalizeThemeName("Ｎｉｎｊａ")).toBe("ninja");
    expect(normalizeThemeName("NINJA")).toBe("ninja");
  });

  test("前後の空白を除き、連続空白を1つにまとめる", () => {
    expect(normalizeThemeName("  忍びの   心得  ")).toBe("忍びの 心得");
  });

  test("全角スペースも空白として扱う", () => {
    expect(normalizeThemeName("忍びの　心得")).toBe("忍びの 心得");
  });

  test("半角カナはNFKCで全角に揃う", () => {
    expect(normalizeThemeName("ﾆﾝｼﾞｬ")).toBe("ニンジャ");
  });

  test("表記が違っても同じキーになる", () => {
    expect(normalizeThemeName(" Ｎｉｎｊａ  道 ")).toBe(normalizeThemeName("ninja 道"));
  });
});

describe("normalizeConstraintChar", () => {
  test("「が」の2表現（合成済みと結合濁点）が同じキーになる", () => {
    const composed = "が"; // が
    const decomposed = "が"; // か + 濁点
    expect(decomposed).not.toBe(composed);
    expect(normalizeConstraintChar(decomposed)).toBe(normalizeConstraintChar(composed));
  });

  test("NFKCではなくNFCなので、変換しすぎない", () => {
    // NFKCだと「㍿」が「株式会社」になってしまう。含む文字は正準等価だけ揃える
    expect(normalizeConstraintChar("ざ")).toBe("ざ");
  });
});

describe("normalizeName", () => {
  test("kindで正規化の仕方が変わる", () => {
    expect(normalizeName("theme", " Ａ Ｂ ")).toBe("a b");
    expect(normalizeName("constraint", "ざ")).toBe("ざ");
  });

  test("テーマ名「ざ」と含む文字「ざ」は同じキーになる（区別はkindで行う）", () => {
    // themes の一意制約が (kind, normalized_name) である理由
    expect(normalizeName("theme", "ざ")).toBe(normalizeName("constraint", "ざ"));
  });
});

describe("isHiraganaOnly", () => {
  test("結合濁点で書かれた「が」を弾かない（NFCを先に行っているか）", () => {
    expect(isHiraganaOnly("が")).toBe(true);
  });

  test("ひらがなを受け入れる", () => {
    expect(isHiraganaOnly("ざ")).toBe(true);
    expect(isHiraganaOnly("しゃ")).toBe(true);
    expect(isHiraganaOnly("ん")).toBe(true);
  });

  test("外来語の読みに出る「ゔ」を受け入れる", () => {
    expect(isHiraganaOnly("ゔ")).toBe(true);
  });

  test("ひらがな以外を弾く", () => {
    expect(isHiraganaOnly("ザ")).toBe(false); // カタカナ
    expect(isHiraganaOnly("座")).toBe(false); // 漢字
    expect(isHiraganaOnly("za")).toBe(false); // 英字
    expect(isHiraganaOnly("1")).toBe(false); // 数字
    expect(isHiraganaOnly("ー")).toBe(false); // 長音符（記号）
    expect(isHiraganaOnly("あ い")).toBe(false); // 空白
    expect(isHiraganaOnly("")).toBe(false); // 空文字
  });

  test("ひらがなと他の文字が混ざっていても弾く", () => {
    expect(isHiraganaOnly("あザ")).toBe(false);
  });
});
