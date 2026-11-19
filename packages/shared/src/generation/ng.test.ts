import { describe, expect, test } from "bun:test";
import { containsNgWord, containsNgWordInName } from "./ng";
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

describe("containsNgWordInName", () => {
  test("ひらがな・カタカナの書き換えで逃げられない", () => {
    expect(containsNgWordInName("チンコ")).toBe(true);
    expect(containsNgWordInName("ちんこ")).toBe(true);
    expect(containsNgWordInName("ぽるの")).toBe(true);
    expect(containsNgWordInName("ぺにす")).toBe(true);
  });

  test("全角・半角の揺れで逃げられない", () => {
    expect(containsNgWordInName("ﾁﾝｺ")).toBe(true);
  });

  test("1文字の NG 語は、名前全体と一致したときだけ弾く", () => {
    expect(containsNgWordInName("盲")).toBe(true);
    expect(containsNgWordInName(" 裸 ")).toBe(true);
    expect(containsNgWordInName("盲点")).toBe(false);
    expect(containsNgWordInName("裸足の季節")).toBe(false);
  });

  test("かなの書き換えは、連なりと丸ごと一致したときだけ当てる", () => {
    expect(containsNgWordInName("チンコの話")).toBe(true);
    // 外来語の中・送り仮名には当てない
    expect(containsNgWordInName("エッチング")).toBe(false);
    expect(containsNgWordInName("ランデブー")).toBe(false);
    expect(containsNgWordInName("動かす")).toBe(false);
    expect(containsNgWordInName("驚かす仕掛け")).toBe(false);
    expect(containsNgWordInName("さーかす")).toBe(false);
    expect(containsNgWordInName("ピンぼけ")).toBe(false);
  });

  test("2文字のカタカナ語は、ひらがなで書けば当てない（最適化する音として普通の音）", () => {
    expect(containsNgWordInName("いく")).toBe(false);
    expect(containsNgWordInName("かす")).toBe(false);
    expect(containsNgWordInName("イク")).toBe(true);
  });

  test("カタカナだけの NG 語は、かなを揃えても外来語の中では当てない", () => {
    expect(containsNgWordInName("ばいく")).toBe(false);
    expect(containsNgWordInName("いくら")).toBe(false);
    expect(containsNgWordInName("かすてら")).toBe(false);
    expect(containsNgWordInName("ぴえろ")).toBe(false);
  });

  test("普通の名前は通す", () => {
    expect(containsNgWordInName("忍者")).toBe(false);
    expect(containsNgWordInName("戦国の合戦")).toBe(false);
    expect(containsNgWordInName("ざ")).toBe(false);
    expect(containsNgWordInName("しゃりん")).toBe(false);
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
