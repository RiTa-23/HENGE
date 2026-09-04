import { describe, expect, test } from "bun:test";
import {
  buildRomanCandidates,
  countKeystrokesFromKana,
  katakanaToHiragana,
  UnsupportedKanaError,
} from "./index";

/** 読みを打てる最短のローマ字列にする（テストの可読性のため） */
function shortest(kana: string): string {
  return buildRomanCandidates(kana)
    .map((unit) => unit.reduce((a, b) => (b.length < a.length ? b : a)))
    .join("");
}

/** その読みを打つのに、この打ち方が受理されるか */
function accepts(kana: string, index: number, roman: string): boolean {
  return buildRomanCandidates(kana)[index]?.includes(roman) ?? false;
}

describe("複数候補の受理", () => {
  test("ふ は fu でも hu でも打てる", () => {
    expect(accepts("ふ", 0, "fu")).toBe(true);
    expect(accepts("ふ", 0, "hu")).toBe(true);
  });

  test("し は shi / si / ci が使える", () => {
    for (const roman of ["shi", "si", "ci"]) expect(accepts("し", 0, roman)).toBe(true);
  });

  test("じ は ji でも zi でも打てる", () => {
    expect(accepts("じ", 0, "ji")).toBe(true);
    expect(accepts("じ", 0, "zi")).toBe(true);
  });
});

describe("拗音", () => {
  test("3系統: しゃ は sha でも sya でも打てる", () => {
    expect(accepts("しゃ", 0, "sha")).toBe(true);
    expect(accepts("しゃ", 0, "sya")).toBe(true);
  });

  test("3系統: ちょ は cho / tyo / cyo が使える", () => {
    for (const roman of ["cho", "tyo", "cyo"]) expect(accepts("ちょ", 0, roman)).toBe(true);
  });

  test("3系統: じゃ は ja / zya / jya が使える", () => {
    for (const roman of ["ja", "zya", "jya"]) expect(accepts("じゃ", 0, roman)).toBe(true);
  });

  test("分解入力: きゃ は kixya / kilya でも打てる", () => {
    expect(accepts("きゃ", 0, "kixya")).toBe(true);
    expect(accepts("きゃ", 0, "kilya")).toBe(true);
  });

  test("分解入力: しゃ は shixya / silya でも打てる", () => {
    expect(accepts("しゃ", 0, "shixya")).toBe(true);
    expect(accepts("しゃ", 0, "silya")).toBe(true);
  });

  test("拗音は2文字で1単位として扱う", () => {
    expect(buildRomanCandidates("しゃ")).toHaveLength(1);
    expect(buildRomanCandidates("しゅりけん")).toHaveLength(4); // しゅ・り・け・ん
  });
});

describe("「っ」の子音借用", () => {
  test("いって を itte で打てる", () => {
    expect(shortest("いって")).toBe("itte");
  });

  test("次のかなの子音を借りる（っし なら s と c）", () => {
    const [sokuon] = buildRomanCandidates("っし");
    expect(sokuon).toContain("s");
    expect(sokuon).toContain("c");
  });

  test("借用しない打ち方も残す", () => {
    for (const roman of ["ltu", "xtu", "ltsu"]) expect(accepts("った", 0, roman)).toBe(true);
  });

  test("文末の「っ」は借用できないので ltu 系のみ", () => {
    expect(buildRomanCandidates("あっ")[1]).toEqual(["ltu", "xtu", "ltsu"]);
  });
});

describe("「ん」の扱い", () => {
  test("3通り: んか は nka / nnka / xnka のいずれでも打てる", () => {
    for (const roman of ["n", "nn", "xn"]) expect(accepts("んか", 0, roman)).toBe(true);
  });

  test("文脈判定: んあ に n 単体は使えない（「な」と区別できなくなるため）", () => {
    expect(buildRomanCandidates("んあ")[0]).toEqual(["nn", "xn"]);
  });

  test("文脈判定: や行の前でも n 単体は使えない", () => {
    expect(buildRomanCandidates("んや")[0]).toEqual(["nn", "xn"]);
  });

  test("文末の「ん」は n 単体を認めない", () => {
    expect(buildRomanCandidates("ほん")[1]).toEqual(["nn", "xn"]);
  });

  test("な行の前では n 単体を認めない（minna で「みんな」は打てない）", () => {
    expect(buildRomanCandidates("みんな")[1]).toEqual(["nn", "xn"]);
  });

  test("な行以外の子音の前では n 単体を認める", () => {
    expect(accepts("しんかん", 1, "n")).toBe(true);
  });
});

describe("外来語のかな", () => {
  test("ふぁ は fa、てぃ は thi", () => {
    expect(accepts("ふぁ", 0, "fa")).toBe(true);
    expect(accepts("てぃ", 0, "thi")).toBe(true);
  });

  test("うぃ・うぇ・ゔ", () => {
    expect(accepts("うぃ", 0, "wi")).toBe(true);
    expect(accepts("うぇ", 0, "we")).toBe(true);
    expect(accepts("ゔ", 0, "vu")).toBe(true);
  });
});

describe("記号5種", () => {
  test("キーの対応", () => {
    expect(buildRomanCandidates("、")).toEqual([[","]]);
    expect(buildRomanCandidates("。")).toEqual([["."]]);
    expect(buildRomanCandidates("ー")).toEqual([["-"]]);
    expect(buildRomanCandidates("！")).toEqual([["!"]]);
    expect(buildRomanCandidates("？")).toEqual([["?"]]);
  });

  test("Shiftは打鍵数に数えない（！ は1打）", () => {
    expect(countKeystrokesFromKana("！")).toBe(1);
    expect(countKeystrokesFromKana("？")).toBe(1);
  });
});

describe("打鍵数", () => {
  test("最短の候補で数える（し は shi ではなく si の2打）", () => {
    expect(countKeystrokesFromKana("し")).toBe(2);
  });

  test("拗音も最短で数える（しゃ は sha の3打）", () => {
    expect(countKeystrokesFromKana("しゃ")).toBe(3);
  });

  test("「ん」は文脈で打鍵数が変わる", () => {
    expect(countKeystrokesFromKana("んか")).toBe(3); // n + ka
    expect(countKeystrokesFromKana("んあ")).toBe(3); // nn + a
  });

  test("お題1問ぶんの読みを数えられる", () => {
    // syu(3) ri(2) ke(2) n(1) ga(2) ya(2) mi(2) wo(2) sa(2) i(1) ta(2) .(1) = 22
    expect(countKeystrokesFromKana("しゅりけんがやみをさいた。")).toBe(22);
  });

  test("範囲の境界値（10打・40打）", () => {
    expect(countKeystrokesFromKana("あいうえおかきくけこ")).toBe(15);
    expect(countKeystrokesFromKana("あいうえおあいうえお")).toBe(10);
  });
});

describe("テーブルに無いかな", () => {
  test("カタカナが混ざっていたら例外を投げる（お題を却下するため）", () => {
    expect(() => buildRomanCandidates("シュリケン")).toThrow(UnsupportedKanaError);
  });

  test("漢字が残っていたら例外を投げる", () => {
    expect(() => buildRomanCandidates("手裏剣")).toThrow(UnsupportedKanaError);
  });
});

describe("katakanaToHiragana", () => {
  test("カタカナをひらがなに変換する", () => {
    expect(katakanaToHiragana("シュリケン")).toBe("しゅりけん");
    expect(katakanaToHiragana("ヴァイオリン")).toBe("ゔぁいおりん");
  });

  test("長音符は変換しない（ひらがなでも同じ文字を使う）", () => {
    expect(katakanaToHiragana("スピード")).toBe("すぴーど");
  });

  test("ひらがな・漢字・記号はそのまま", () => {
    expect(katakanaToHiragana("しのび")).toBe("しのび");
    expect(katakanaToHiragana("手裏剣、")).toBe("手裏剣、");
  });

  test("変換後はローマ字候補テーブルに載る", () => {
    expect(() => buildRomanCandidates(katakanaToHiragana("スピード"))).not.toThrow();
  });
});
