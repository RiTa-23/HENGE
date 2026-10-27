import { describe, expect, it } from "bun:test";
import {
  buildRomanCandidates,
  pressKey,
  splitKanaUnits,
  startTyping,
  type TypingProgress,
} from "@henge/shared";
import { addTally, EMPTY_TALLY, findTargets, targetState } from "./targets";

/** 読みを打鍵の単位に切って、`keys` を順に打った状態を返す */
function typed(kana: string, keys: string): TypingProgress {
  let progress = startTyping(buildRomanCandidates(kana));
  for (const key of keys) progress = pressKey(progress, key);
  return progress;
}

describe("findTargets: 最適化する音の箇所をかな単位で返す", () => {
  it("1か所", () => {
    expect(findTargets(splitKanaUnits("ざぜん"), "ざ")).toEqual([{ first: 0, last: 0 }]);
  });

  it("複数か所", () => {
    expect(findTargets(splitKanaUnits("ざっしのざつだん"), "ざ")).toEqual([
      { first: 0, last: 0 },
      { first: 4, last: 4 },
    ]);
  });

  it("2かな以上の音は1つの的にまとめる", () => {
    expect(findTargets(splitKanaUnits("できごと"), "でき")).toEqual([{ first: 0, last: 1 }]);
  });

  // countConstraint と同じ数え方。数え方がずれると、採用の根拠と違う箇所に的が立つ
  it("重なりは数えない（「さささ」に「ささ」は1回）", () => {
    expect(findTargets(splitKanaUnits("さささ"), "ささ")).toEqual([{ first: 0, last: 1 }]);
  });

  // 字面では含まれていても、打つときには別のかなになる箇所に的を立てない
  it("後ろの小書きと1単位になるかなには的を立てない（でぃ は dhi、きゃ は kya）", () => {
    expect(findTargets(splitKanaUnits("でぃすくで"), "で")).toEqual([{ first: 3, last: 3 }]);
    expect(findTargets(splitKanaUnits("きゃくのきもち"), "き")).toEqual([{ first: 3, last: 3 }]);
    // し / きゃ。「しき」の「き」は「きゃ」の一部
    expect(findTargets(splitKanaUnits("しきゃ"), "しき")).toEqual([]);
  });

  it("前のかなと1単位になる小書きには的を立てない", () => {
    expect(findTargets(splitKanaUnits("きゃく"), "ゃ")).toEqual([]);
  });

  it("拗音そのものを指定すれば、その単位に的を立てる", () => {
    expect(findTargets(splitKanaUnits("しきゃく"), "きゃ")).toEqual([{ first: 1, last: 1 }]);
  });

  it("分解された濁点でも一致する（NFC に揃える）", () => {
    expect(findTargets(splitKanaUnits("ざぜん"), "ざ")).toEqual([{ first: 0, last: 0 }]);
  });

  it("含まれなければ空", () => {
    expect(findTargets(splitKanaUnits("こころ"), "ざ")).toEqual([]);
  });

  it("音が空なら空（全部の位置に的を立てない）", () => {
    expect(findTargets(splitKanaUnits("こころ"), "")).toEqual([]);
  });
});

describe("targetState: 的を打てたか", () => {
  // こ / こ / ざ / ぜ / ん。的は「ざ」（単位2）
  const kana = "ここざぜん";
  const span = { first: 2, last: 2 };

  it("差しかかる前は pending、苦無が的に入ったら active", () => {
    expect(targetState(span, typed(kana, "kok"))).toBe("pending");
    expect(targetState(span, typed(kana, "koko"))).toBe("active");
  });

  it("打っている最中は active（途中でミスしていても、打ち終えるまでは active）", () => {
    expect(targetState(span, typed(kana, "kokoz"))).toBe("active");
    expect(targetState(span, typed(kana, "kokozx"))).toBe("active");
  });

  it("ミスなく打ち終えたら hit", () => {
    expect(targetState(span, typed(kana, "kokoza"))).toBe("hit");
  });

  it("的の中でミスしたら miss", () => {
    expect(targetState(span, typed(kana, "kokozxa"))).toBe("miss");
  });

  it("的の最初の1打でミスしても miss", () => {
    expect(targetState(span, typed(kana, "kokoxza"))).toBe("miss");
  });

  it("的の直前のミスは数えない", () => {
    expect(targetState(span, typed(kana, "kokxoza"))).toBe("hit");
  });

  it("的の直後のミスは数えない", () => {
    expect(targetState(span, typed(kana, "kokozaxze"))).toBe("hit");
  });

  // 表示の文字列ではなく実際に打った経路で範囲を出す。`si` と `shi` で長さが違う
  it("的より前を長い経路で打っても、範囲がずれない", () => {
    // し / ざ。`shi` で打つと的の始まりは表示位置3
    const progress = typed("しざ", "shizxa");
    expect(targetState({ first: 1, last: 1 }, progress)).toBe("miss");
    expect(targetState({ first: 1, last: 1 }, typed("しざ", "shixza"))).toBe("miss");
    expect(targetState({ first: 1, last: 1 }, typed("しざ", "sxhiza"))).toBe("hit");
  });

  // 「ん」を `n` で打ち、続くキーが伸ばせないと「ん」を確定してから次のかなで判定される。
  // そのキーのミスは次のかな（ここでは的）に記録される
  it("「ん」を n 1打で確定した直後のミスは、次のかなの側で数える", () => {
    // か / ん / ざ。的は「ざ」
    expect(targetState({ first: 2, last: 2 }, typed("かんざ", "kanxza"))).toBe("miss");
    expect(targetState({ first: 1, last: 1 }, typed("かんざ", "kanxza"))).toBe("hit");
  });

  it("2かな以上の的は、どのかなでミスしても miss", () => {
    const span2 = { first: 0, last: 1 };
    expect(targetState(span2, typed("できる", "dekiru"))).toBe("hit");
    expect(targetState(span2, typed("できる", "dekxiru"))).toBe("miss");
  });
});

describe("addTally: 1問ぶんの的を足す", () => {
  it("的中数と的の数を足し合わせる", () => {
    const kana = "ざっしのざつだん";
    const spans = findTargets(splitKanaUnits(kana), "ざ");
    // 1つ目の「ざ」でミス、2つ目は的中
    const progress = typed(kana, "zxassinozatudann");
    expect(progress.finished).toBe(true);
    const tally = addTally({ hits: 3, total: 5 }, spans, progress);
    expect(tally).toEqual({ hits: 4, total: 7 });
  });

  it("的の無いお題は何も足さない", () => {
    expect(addTally(EMPTY_TALLY, [], typed("こころ", "kokoro"))).toEqual(EMPTY_TALLY);
  });
});
