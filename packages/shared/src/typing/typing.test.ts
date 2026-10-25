import { describe, expect, test } from "bun:test";
import {
  buildRomanCandidates,
  countKeystrokesFromKana,
  hiraganaToKatakana,
  katakanaToHiragana,
  splitKanaUnits,
  UnsupportedKanaError,
} from "./index";

/** 小書きのかな。分解されたまま単体の単位で残っていないかを見るのに使う */
const SMALL_KANA = "ぁぃぅぇぉゃゅょゎ";

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

  // 「ジェット」「ジェスチャー」など頻出なのに抜けていた。テーブルを整理したときに
  // 黙って消えないよう、分解入力まで含めて固定する
  test("じぇ は je / zye / jye、分解入力もできる", () => {
    expect(accepts("じぇ", 0, "je")).toBe(true);
    expect(accepts("じぇ", 0, "zye")).toBe(true);
    expect(accepts("じぇ", 0, "jye")).toBe(true);
    expect(accepts("じぇ", 0, "jixe")).toBe(true);
  });

  // 「ウォーミングアップ」「フォロー」など頻出なのに、うぉ が無く uxo でしか
  // 打てなかった。wh 系は4つまとめて固定する
  test("わ行の外来語は wh 系で打てる（うぉ は who）", () => {
    expect(accepts("うぉ", 0, "who")).toBe(true);
    expect(accepts("うぁ", 0, "wha")).toBe(true);
    expect(accepts("うぃ", 0, "whi")).toBe(true);
    expect(accepts("うぇ", 0, "whe")).toBe(true);
  });

  // wh 系を足しても、これまでの打ち方は残す
  test("うぃ / うぇ の wi / we と、分解入力は残る", () => {
    expect(accepts("うぃ", 0, "wi")).toBe(true);
    expect(accepts("うぇ", 0, "we")).toBe(true);
    expect(accepts("うぉ", 0, "uxo")).toBe(true);
    expect(accepts("うぉ", 0, "ulo")).toBe(true);
  });

  test("ぢぇ は dye", () => {
    expect(accepts("ぢぇ", 0, "dye")).toBe(true);
  });

  // 「チェック」「チェーン」など頻出。じぇ と同じく、テーブル整理で消えないよう固定する
  test("ちぇ は che / tye / cye、分解入力もできる", () => {
    expect(accepts("ちぇ", 0, "che")).toBe(true);
    expect(accepts("ちぇ", 0, "tye")).toBe(true);
    expect(accepts("ちぇ", 0, "cye")).toBe(true);
    expect(accepts("ちぇ", 0, "tixe")).toBe(true);
  });

  // 「シェア」「シェフ」が し+ぇ に割れていて、IMEで通る she / sye が通らなかった
  test("しぇ は she / sye、分解入力もできる", () => {
    expect(accepts("しぇ", 0, "she")).toBe(true);
    expect(accepts("しぇ", 0, "sye")).toBe(true);
    expect(accepts("しぇ", 0, "sixe")).toBe(true);
  });

  // 「プロデューサー」。てぃ / でぃ と同じ th / dh 系で揃える（てゅ は でゅ の対）
  test("てゅ は thu、でゅ は dhu", () => {
    expect(accepts("てゅ", 0, "thu")).toBe(true);
    expect(accepts("でゅ", 0, "dhu")).toBe(true);
    expect(accepts("でゅ", 0, "dexyu")).toBe(true);
  });

  // 「ヴァンパイア」が ゔ+ぁ、「タトゥー」が と+ぅ に割れていて、IMEで通る va / twu が
  // 通らなかった。**族ごとに固定する**（1つだけ足すと、隣り合うかなが分解入力のまま残る）
  test("ts / q / v / fy / tw・dw 系は族ごとに打てる", () => {
    const direct: [string, string][] = [
      ["つぁ", "tsa"],
      ["つぃ", "tsi"],
      ["つぇ", "tse"],
      ["つぉ", "tso"],
      ["くぁ", "qa"],
      ["くぃ", "qi"],
      ["くぇ", "qe"],
      ["くぉ", "qo"],
      ["ゔぁ", "va"],
      ["ゔぃ", "vi"],
      ["ゔぇ", "ve"],
      ["ゔぉ", "vo"],
      ["ふゃ", "fya"],
      ["ふゅ", "fyu"],
      ["ふょ", "fyo"],
      ["とぅ", "twu"],
      ["どぅ", "dwu"],
    ];
    for (const [kana, roman] of direct) expect(accepts(kana, 0, roman)).toBe(true);
  });

  test("くぁ系は kw 系でも、分解入力でも打てる", () => {
    for (const [kana, roman] of [
      ["くぁ", "kwa"],
      ["くぃ", "kwi"],
      ["くぇ", "kwe"],
      ["くぉ", "kwo"],
    ])
      expect(accepts(kana as string, 0, roman as string)).toBe(true);
    expect(accepts("くぉ", 0, "kuxo")).toBe(true);
    expect(accepts("ゔぁ", 0, "vuxa")).toBe(true);
  });

  /*
    **小書きのかなが単体の単位で残らないことを、実在の外来語の読みで機械的に見る。**
    この壊れ方（`ゔぁ` が `vuxa` でしか打てない）は打てなくはないので、画面を見ても
    気付けない。読みは共通語彙リストに実際に入っている語から取った
  */
  test("外来語の読みに、分解されたままの小書きのかなが残らない", () => {
    const readings = [
      "しぇあ", // シェア
      "たとぅー", // タトゥー
      "ぷろでゅーさー", // プロデューサー
      "ゔぁんぱいあ", // ヴァンパイア
      "ふゅーじょん", // フュージョン
      "ゔぃんてーじ", // ヴィンテージ
      "くぉーたー", // クォーター
      "ひんどぅー", // ヒンドゥー
      "ゔぇのむ", // ヴェノム
      "ぷれっつぇる", // プレッツェル
      "もっつぁれら", // モッツァレラ
      "くぃでぃっち", // クィディッチ
      "えすくぁいあ", // エスクァイア
      "すけるつぉ", // スケルツォ
    ];
    for (const reading of readings) {
      const lone = splitKanaUnits(reading).filter((unit) => SMALL_KANA.includes(unit));
      expect(lone).toEqual([]);
    }
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

  // 上限そのものの判定は validate.test.ts が KEYSTROKE_MAX を使って見る。
  // ここは「数えられること」だけを見るので、名前に具体値を書かない
  test("下限ちょうど（10打）まで数えられる", () => {
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

describe("hiraganaToKatakana", () => {
  test("ひらがなをカタカナに変換する（ゔ は ヴ）", () => {
    expect(hiraganaToKatakana("かきごおり")).toBe("カキゴオリ");
    expect(hiraganaToKatakana("ゔぁいおりん")).toBe("ヴァイオリン");
  });

  test("カタカナ・長音符・漢字はそのまま", () => {
    expect(hiraganaToKatakana("スピード")).toBe("スピード");
    expect(hiraganaToKatakana("すぴーど")).toBe("スピード");
    expect(hiraganaToKatakana("手裏剣")).toBe("手裏剣");
  });

  test("katakanaToHiragana と往復できる", () => {
    expect(katakanaToHiragana(hiraganaToKatakana("しゅりけん"))).toBe("しゅりけん");
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
