import { describe, expect, test } from "bun:test";
import { buildRomanCandidates } from "./build";
import { accuracy, pressKey, romanDisplay, startTyping, type TypingProgress } from "./match";

/** 読み仮名に対してローマ字を順に打ち込む */
function type(kana: string, keys: string): TypingProgress {
  let progress = startTyping(buildRomanCandidates(kana));
  for (const key of keys) progress = pressKey(progress, key);
  return progress;
}

describe("複数候補の受理", () => {
  test.each([
    ["ふ", "fu"],
    ["ふ", "hu"],
    ["し", "shi"],
    ["し", "si"],
    ["し", "ci"],
    ["つ", "tsu"],
    ["つ", "tu"],
    ["ち", "chi"],
    ["ち", "ti"],
    ["じ", "ji"],
    ["じ", "zi"],
  ])("%s は %s で確定する", (kana, keys) => {
    const progress = type(kana, keys);

    expect(progress.finished).toBe(true);
    expect(progress.missCount).toBe(0);
  });

  test("確定していない打ち方では finished にならない", () => {
    expect(type("し", "s").finished).toBe(false);
  });
});

describe("前方一致の絞り込み", () => {
  test("`s` の後は `shi` と `si` の両方が候補に残る", () => {
    const progress = type("し", "s");

    expect([...progress.matches].toSorted()).toEqual(["shi", "si"]);
  });

  test("`sh` まで打つと `shi` だけが残る", () => {
    expect(type("し", "sh").matches).toEqual(["shi"]);
  });

  test("候補から外れた打鍵はミスになり、候補は減らない", () => {
    const progress = type("し", "sk");

    expect(progress.missCount).toBe(1);
    expect([...progress.matches].toSorted()).toEqual(["shi", "si"]);
  });

  test("ミスの後に正しく打てば続行できる（巻き戻さない）", () => {
    const progress = type("し", "skhi");

    expect(progress.finished).toBe(true);
    expect(progress.missCount).toBe(1);
  });
});

describe("拗音", () => {
  test.each([
    ["しゃ", "sha"],
    ["しゃ", "sya"],
    ["ちゃ", "cha"],
    ["ちゃ", "tya"],
    ["ちゃ", "cya"],
    ["じゃ", "ja"],
    ["じゃ", "zya"],
    ["じゃ", "jya"],
    ["きゃ", "kya"],
  ])("%s は %s で確定する", (kana, keys) => {
    expect(type(kana, keys).finished).toBe(true);
  });

  test.each([
    ["きゃ", "kixya"],
    ["きゃ", "kilya"],
    ["しゃ", "sixya"],
    ["しゃ", "shilya"],
  ])("分解入力 %s = %s", (kana, keys) => {
    expect(type(kana, keys).finished).toBe(true);
  });
});

describe("「っ」の子音借用", () => {
  test("いって を itte で打てる", () => {
    expect(type("いって", "itte").finished).toBe(true);
  });

  test("いって を iltute でも打てる", () => {
    expect(type("いって", "iltute").finished).toBe(true);
  });

  test("借用できるのは次のかなの子音だけ（`k` は「って」では受理しない）", () => {
    expect(type("いって", "ik").missCount).toBe(1);
  });
});

describe("「ん」の扱い", () => {
  test.each(["nka", "nnka", "xnka"])("んか は %s で打てる", (keys) => {
    const progress = type("んか", keys);

    expect(progress.finished).toBe(true);
    expect(progress.missCount).toBe(0);
  });

  // `n` + `あ` は `na`（＝「な」）と区別できない。曖昧さを設計時点で排除する
  test("んあ に `na` は使えない", () => {
    expect(type("んあ", "na").finished).toBe(false);
  });

  test.each(["nna", "xna"])("んあ は %s で打てる", (keys) => {
    expect(type("んあ", keys).finished).toBe(true);
  });

  // `n` + `な` は `nna`（＝「んな」）と衝突する
  test("んな に `n` 単体は使えない（minna では打てない）", () => {
    expect(type("んな", "nna").finished).toBe(false);
  });

  test("んな は nnna で打てる", () => {
    expect(type("んな", "nnna").finished).toBe(true);
  });

  test("文末の ん に `n` 単体は使えない", () => {
    expect(type("ほん", "hon").finished).toBe(false);
    expect(type("ほん", "honn").finished).toBe(true);
  });
});

describe("外来語のかな", () => {
  test.each([
    ["ふぁ", "fa"],
    ["てぃ", "thi"],
    ["でぃ", "dhi"],
    ["うぃ", "wi"],
    ["ゔ", "vu"],
  ])("%s は %s で確定する", (kana, keys) => {
    expect(type(kana, keys).finished).toBe(true);
  });
});

describe("記号5種", () => {
  test.each([
    ["、", ","],
    ["。", "."],
    ["ー", "-"],
    ["！", "!"],
    ["？", "?"],
  ])("%s は %s で確定する", (kana, keys) => {
    expect(type(kana, keys).finished).toBe(true);
  });
});

describe("撒菱の位置（ミスした表示位置）", () => {
  test("ミスした位置を1つ記録する", () => {
    const progress = type("かき", "kax");

    expect([...progress.misses]).toEqual([2]);
  });

  // 同じ場所で何度つまずいても撒菱は1つ
  test("同じ位置で複数回ミスしても1つにまとまる", () => {
    const progress = type("かき", "kaxyz");

    expect(progress.misses.size).toBe(1);
    expect(progress.missCount).toBe(3);
  });

  test("違う位置のミスは別々に記録される", () => {
    const progress = type("かき", "xkazki");

    expect([...progress.misses].toSorted((a, b) => a - b)).toEqual([0, 2]);
  });

  // `shi` の `h` で詰まるのと `s` で詰まるのを区別する（かな単位ではない）
  test("ローマ字1文字ごとに紐づく", () => {
    expect([...type("し", "sq").misses]).toEqual([1]);
    expect([...type("し", "q").misses]).toEqual([0]);
  });
});

describe("表示用のローマ字列と苦無の位置", () => {
  test("未確定のかなは最短候補で表示する", () => {
    const progress = startTyping(buildRomanCandidates("しち"));

    expect(romanDisplay(progress)).toEqual({ text: "siti", cursor: 0 });
  });

  test("打った経路が確定した部分に反映される", () => {
    const progress = type("しち", "shi");

    expect(romanDisplay(progress)).toEqual({ text: "shiti", cursor: 3 });
  });

  test("打ち込み途中は絞り込まれた候補が表示に出る", () => {
    const progress = type("しち", "sh");

    expect(romanDisplay(progress)).toEqual({ text: "shiti", cursor: 2 });
  });

  test("苦無はミスしても進まない", () => {
    expect(romanDisplay(type("しち", "shq")).cursor).toBe(2);
  });
});

describe("正確率", () => {
  test("打鍵が無ければ1", () => {
    expect(accuracy(startTyping(buildRomanCandidates("か")))).toBe(1);
  });

  test("ミスなしなら1", () => {
    expect(accuracy(type("かき", "kaki"))).toBe(1);
  });

  test("4打中1ミスなら0.8（延べ5打鍵）", () => {
    expect(accuracy(type("かき", "kazki"))).toBeCloseTo(0.8);
  });
});

describe("完了後の打鍵", () => {
  test("完了後は状態が変わらない", () => {
    const done = type("か", "ka");

    expect(pressKey(done, "z")).toBe(done);
  });
});
