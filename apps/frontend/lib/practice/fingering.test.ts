import { beforeEach, describe, expect, it } from "bun:test";
import {
  buildRomanCandidates,
  pressKey,
  romanDisplay,
  splitKanaUnits,
  startTyping,
  type TypingProgress,
} from "@henge/shared";
import type { Finger } from "@/lib/play/fingers";
import {
  chosenFingerAt,
  chosenRomans,
  type Fingering,
  decodeFingering,
  encodeFingering,
  isDefaultFingering,
  parseFingering,
  readFingering,
  resolveFingering,
  romanChoices,
  writeFingering,
} from "./fingering";
import { findTargets } from "./targets";

/** bun のテスト環境には localStorage が無いので最小限の実装を置く（prefs.test.ts と同じ） */
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

const RIGHT_INDEX: Finger = { hand: "right", finger: "index" };
const RIGHT_MIDDLE: Finger = { hand: "right", finger: "middle" };
const LEFT_RING: Finger = { hand: "left", finger: "ring" };

/** 「き」を k=右人差し指・i=右中指 で打つ（docs/07-ui.md の例） */
const KI: Fingering = { units: [{ roman: "ki", fingers: [RIGHT_INDEX, RIGHT_MIDDLE] }] };

/** 読みに対して、最適化する音 `sound` の運指を当てて打ち始める（PlayScreen と同じ組み立て） */
function play(kana: string, sound: string, fingering: Fingering | null, keys = "") {
  const spans = findTargets(splitKanaUnits(kana), sound);
  let progress: TypingProgress = startTyping(
    buildRomanCandidates(kana),
    chosenRomans(fingering, spans),
  );
  for (const key of keys) progress = pressKey(progress, key);
  return { progress, finger: chosenFingerAt(progress, spans, fingering) };
}

describe("打ち方の一覧", () => {
  it("table.ts の候補を並びのまま出す", () => {
    expect(romanChoices("し")).toEqual(["si", "shi", "ci"]);
  });

  // 前後のかなで打ち方が変わり、1つに決めておけない
  it("「ん」「っ」は決められない", () => {
    expect(romanChoices("ん")).toEqual([]);
    expect(romanChoices("っ")).toEqual([]);
  });
});

describe("既定の運指", () => {
  it("先頭の打ち方を標準運指で打つ", () => {
    expect(resolveFingering("き", null)).toEqual({
      units: [{ roman: "ki", fingers: [RIGHT_MIDDLE, RIGHT_MIDDLE] }],
    });
  });

  it("「ん」「っ」の単位は null", () => {
    expect(resolveFingering("きっ", null).units[1]).toBeNull();
  });

  it("指を1つでも変えれば既定ではない", () => {
    expect(isDefaultFingering("き", resolveFingering("き", null))).toBe(true);
    expect(isDefaultFingering("き", KI)).toBe(false);
  });
});

describe("保存と読み出し", () => {
  it("書いたものを読み戻せる", () => {
    writeFingering("き", KI);
    expect(readFingering("き")).toEqual(KI);
  });

  it("音ごとに別に持つ", () => {
    writeFingering("き", KI);
    expect(readFingering("ざ")).toBeNull();
  });

  it("結合濁点で書かれた音でも同じ設定を開く", () => {
    const de: Fingering = { units: [{ roman: "de", fingers: [LEFT_RING, LEFT_RING] }] };
    writeFingering("で", de);
    expect(readFingering("で")).toEqual(de);
  });

  // 既定と同じものを残すと、table.ts の並びを変えたときに古い既定が残り続ける
  it("既定と同じなら消す", () => {
    writeFingering("き", KI);
    writeFingering("き", resolveFingering("き", null));
    expect(globalThis.localStorage.getItem("henge:fingering:き")).toBeNull();
  });

  it("null を渡すと標準に戻る", () => {
    writeFingering("き", KI);
    writeFingering("き", null);
    expect(readFingering("き")).toBeNull();
  });

  describe("作成者の運指（既定の運指）がある練習", () => {
    it("作成者の運指と同じなら消す", () => {
      writeFingering("き", KI, KI);
      expect(globalThis.localStorage.getItem("henge:fingering:き")).toBeNull();
    });

    // 消すと作成者の運指に戻ってしまい、標準運指で打ちたい人が選べなくなる
    it("標準運指を選んだら消さずに残す", () => {
      const standard = resolveFingering("き", null);
      writeFingering("き", standard, KI);
      expect(readFingering("き")).toEqual(standard);
    });
  });

  describe("サーバーから届いた運指（JSON のまま）", () => {
    it("保存の形に直したものを読み戻せる", () => {
      expect(decodeFingering(encodeFingering(KI), "き")).toEqual(KI);
    });

    it.each([
      ["null", null],
      ["音と単位の数が違う", { units: [] }],
      [
        "その音で打てない打ち方",
        { units: [{ roman: "zi", fingers: ["left-ring", "right-middle"] }] },
      ],
      ["単位が null でもオブジェクトでもない", { units: [1] }],
    ])("%s なら null", (_, value) => {
      expect(decodeFingering(value, "き")).toBeNull();
    });
  });

  describe("形が合わなければ全体を捨てる", () => {
    it.each([
      ["JSON でない", "{"],
      ["単位の数が違う", '{"units":[]}'],
      [
        "その単位で打てない打ち方",
        '{"units":[{"roman":"chi","fingers":["right-index","right-index","right-middle"]}]}',
      ],
      ["文字数と指の数が違う", '{"units":[{"roman":"ki","fingers":["right-index"]}]}'],
      ["指の名前が無い", '{"units":[{"roman":"ki","fingers":["right-index","right-toe"]}]}'],
    ])("%s", (_, raw) => {
      expect(parseFingering(raw, "き")).toBeNull();
    });
  });
});

describe("プレイ中の打ち方と指", () => {
  it("的の箇所で、決めた指を1文字ずつ出す", () => {
    expect(play("かき", "き", KI, "ka").finger).toEqual(RIGHT_INDEX);
    expect(play("かき", "き", KI, "kak").finger).toEqual(RIGHT_MIDDLE);
  });

  it("的の外では出さない（標準運指に任せる）", () => {
    expect(play("かき", "き", KI).finger).toBeNull();
  });

  it("決めていなければ出さない", () => {
    expect(play("き", "き", null).finger).toBeNull();
  });

  it("決めた打ち方を的の箇所だけに出す", () => {
    const shi: Fingering = {
      units: [{ roman: "shi", fingers: [LEFT_RING, RIGHT_INDEX, RIGHT_MIDDLE] }],
    };
    const { progress, finger } = play("しかし", "し", shi);
    expect(romanDisplay(progress).text).toBe("shikashi");
    expect(finger).toEqual(LEFT_RING);
  });

  // 打ち方と指は1文字ずつ対応しているので、表示が違う打ち方の指は使えない
  it("別の打ち方で打ち始めたら指も標準に戻す", () => {
    const shi: Fingering = {
      units: [{ roman: "shi", fingers: [LEFT_RING, RIGHT_INDEX, RIGHT_MIDDLE] }],
    };
    // `shi` と決めて `c` から打った。表示は `ci` に切り替わる
    const { progress, finger } = play("し", "し", shi, "c");
    expect(romanDisplay(progress).text).toBe("ci");
    expect(finger).toBeNull();
    // 決めた打ち方の途中までなら、決めた指のまま
    expect(play("し", "し", shi, "s").finger).toEqual(RIGHT_INDEX);
  });

  it("2かな以上の音は単位ごとに決めた運指を出す", () => {
    const deki: Fingering = {
      units: [
        { roman: "de", fingers: [LEFT_RING, { hand: "left", finger: "middle" }] },
        { roman: "ki", fingers: [RIGHT_INDEX, RIGHT_MIDDLE] },
      ],
    };
    expect(play("できる", "でき", deki).finger).toEqual(LEFT_RING);
    expect(play("できる", "でき", deki, "de").finger).toEqual(RIGHT_INDEX);
    expect(play("できる", "でき", deki, "deki").finger).toBeNull();
  });

  // 「ん」は `n` を打ったあと確定を保留する。苦無は次のかなの1文字目を指している
  it("確定を保留しているかなの次から引く", () => {
    expect(play("んき", "き", KI, "n").finger).toEqual(RIGHT_INDEX);
  });

  it("打ち終えたら出さない", () => {
    expect(play("き", "き", KI, "ki").finger).toBeNull();
  });
});
