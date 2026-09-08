import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, neuronsUsed } from "../src/generation/model";

/**
 * 消費ニューロンの計算。**上限の判定に使う値がここで決まる。**
 *
 * 応答にニューロン数は入っていない（返るのはトークン数だけ）ため、この計算が
 * ずれると課金台帳がそのままずれる。単価は `MODELS` にモデルごとに持つ。
 */
describe("neuronsUsed", () => {
  it("入力・出力それぞれの単価を掛けて合算する", () => {
    // qwen3: 入力 4,625 / 出力 30,475（いずれも100万トークンあたり）
    // 1,000,000トークンずつ渡せば、単価がそのまま出る
    expect(
      neuronsUsed(DEFAULT_MODEL, { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }),
    ).toBeCloseTo(4_625 + 30_475);
  });

  it("実際の呼び出しに近い規模で1回分の消費になる", () => {
    // 入力350・出力500トークン（20件バッチのおおよその規模）
    expect(neuronsUsed(DEFAULT_MODEL, { prompt_tokens: 350, completion_tokens: 500 })).toBeCloseTo(
      (350 * 4_625 + 500 * 30_475) / 1_000_000,
    );
  });

  it("**出力の方が高い。** 入力と出力を取り違えると消費を小さく見積もる", () => {
    const output = neuronsUsed(DEFAULT_MODEL, { prompt_tokens: 0, completion_tokens: 1_000 });
    const input = neuronsUsed(DEFAULT_MODEL, { prompt_tokens: 1_000, completion_tokens: 0 });
    expect(output).toBeGreaterThan(input);
  });

  it("モデルごとに単価が違う", () => {
    const usage = { prompt_tokens: 1_000, completion_tokens: 1_000 };
    const qwen = neuronsUsed("@cf/qwen/qwen3-30b-a3b-fp8", usage);
    const glm = neuronsUsed("@cf/zai-org/glm-4.7-flash", usage);
    expect(glm).toBeGreaterThan(qwen);
  });

  it("片方しか返らなくても、返った分だけ数える", () => {
    expect(neuronsUsed(DEFAULT_MODEL, { completion_tokens: 1_000 })).toBeCloseTo(
      (1_000 * 30_475) / 1_000_000,
    );
  });

  /**
   * **推定値で埋めない。** 消費していないのに減らすより、記録漏れの方が
   * 利用者に対して害が少ない。
   */
  it("usage が無ければ0", () => {
    expect(neuronsUsed(DEFAULT_MODEL, undefined)).toBe(0);
    expect(neuronsUsed(DEFAULT_MODEL, {})).toBe(0);
  });

  it("単価を知らないモデル（検証用に直接渡されたID）は0", () => {
    expect(neuronsUsed("@cf/unknown/model", { prompt_tokens: 100, completion_tokens: 100 })).toBe(
      0,
    );
  });

  it("MODELS に載っているモデルはすべて単価を持つ", () => {
    for (const [model, config] of Object.entries(MODELS)) {
      expect(config.neurons, model).toBeDefined();
    }
  });
});
