import { describe, expect, test } from "bun:test";
import { DAILY_NEURON_LIMIT } from "./session";
import { canGenerate, remainingNeurons } from "./quota";

describe("remainingNeurons", () => {
  test("使っていなければ上限がそのまま残る", () => {
    expect(remainingNeurons(0)).toBe(DAILY_NEURON_LIMIT);
  });

  test("小数の消費もそのまま引く（ニューロンは整数にならない）", () => {
    expect(remainingNeurons(35.1)).toBeCloseTo(DAILY_NEURON_LIMIT - 35.1);
  });

  test("使い切ったら0", () => {
    expect(remainingNeurons(DAILY_NEURON_LIMIT)).toBe(0);
  });

  /**
   * **超過はありうる。** 残り1ニューロンでも生成を通し、実際に使った分を
   * そのまま記録するため。マイナスの残数を画面に出さないよう0で張り付ける。
   */
  test("上限を超えて消費していても0に張り付く", () => {
    expect(remainingNeurons(DAILY_NEURON_LIMIT + 20.5)).toBe(0);
  });
});

describe("canGenerate", () => {
  test("残っていれば許可する", () => {
    expect(canGenerate(0)).toBe(true);
  });

  /**
   * **1回分を予約しない。** 残り0.1ニューロンでも1回は通る（その回で
   * 20前後まで超過しうる）。見積り分を先に引く方式は、モデルを変えるたびに
   * 見積り定数を手で直すことになる。
   */
  test("わずかでも残っていれば1回は通す", () => {
    expect(canGenerate(DAILY_NEURON_LIMIT - 0.1)).toBe(true);
  });

  test("使い切っていたら許可しない", () => {
    expect(canGenerate(DAILY_NEURON_LIMIT)).toBe(false);
    expect(canGenerate(DAILY_NEURON_LIMIT + 20.5)).toBe(false);
  });
});
