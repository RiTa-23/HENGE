import { describe, expect, test } from "bun:test";
import { containsNgWord } from "./ng";
import { NG_WORDS } from "./ng-words";

describe("containsNgWord", () => {
  test("文の中の NG 語を拾う（漢字・ひらがな）", () => {
    expect(containsNgWord("夜道で痴漢に遭った")).toBe(true);
    expect(containsNgWord("うんこを踏んだ")).toBe(true);
  });

  test("カタカナの NG 語は、カタカナの連なりと一致すれば拾う", () => {
    expect(containsNgWord("あいつはバカだ")).toBe(true);
    expect(containsNgWord("ポルノを見る")).toBe(true);
  });

  test("カタカナの NG 語が外来語の中にあるだけなら拾わない", () => {
    // 部分一致だと共通語彙リストだけで88語が巻き込まれた（イク・カス・エロ・バカ）
    expect(containsNgWord("バイクで峠を越える")).toBe(false);
    expect(containsNgWord("マイクを握る")).toBe(false);
    expect(containsNgWord("カステラを切り分ける")).toBe(false);
    expect(containsNgWord("ピエロが笑う")).toBe(false);
    expect(containsNgWord("夏のバカンスに出かける")).toBe(false);
  });

  test("1文字の NG 語は見ない（盲点・裸足まで落とさない）", () => {
    expect(NG_WORDS).toContain("盲");
    expect(NG_WORDS).toContain("裸");
    expect(containsNgWord("思わぬ盲点があった")).toBe(false);
    expect(containsNgWord("裸足で砂浜を歩く")).toBe(false);
  });

  test("判断モデルが単語1語だけでは止めきれなかった語を拾う（#330）", () => {
    expect(containsNgWord("雌豚")).toBe(true);
    expect(containsNgWord("黒んぼ")).toBe(true);
    expect(containsNgWord("片輪")).toBe(true);
    expect(containsNgWord("ペニス")).toBe(true);
    expect(containsNgWord("ぺにす")).toBe(true);
  });

  test("普通の文は通す", () => {
    expect(containsNgWord("手裏剣が闇を裂いた")).toBe(false);
  });
});

describe("NG_WORDS", () => {
  test("打てる文字だけでできている（打てない語は文字種の検査で必ず落ちるので持たない）", () => {
    for (const word of NG_WORDS) expect(word).toMatch(/^[ぁ-ゖァ-ヺー々一-鿿]+$/u);
  });

  test("重複が無い", () => {
    expect(new Set(NG_WORDS).size).toBe(NG_WORDS.length);
  });
});
