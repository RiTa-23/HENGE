import { describe, expect, it } from "vitest";
import { AiQuotaExceededError, AiUnavailableError, classifyAiError } from "../src/generation/ai";

/**
 * Workers AI の例外の翻訳。
 *
 * **3036（日次無料枠を使い切った）と 3040（Out of Capacity）は解消時期が違う。**
 * 前者は翌 00:00 UTC まで戻らず、後者は数分で直りうる。案内文が正反対になるので
 * 区別する。翻訳できないものを `null` にするのは、従来どおり
 * `GENERATION_FAILED` に落として壊さないため。
 */
describe("classifyAiError", () => {
  it("3036 は枠切れとして扱う（code が数値）", () => {
    expect(classifyAiError(Object.assign(new Error("boom"), { code: 3036 }))).toBeInstanceOf(
      AiQuotaExceededError,
    );
  });

  it("3036 は枠切れとして扱う（code が文字列）", () => {
    expect(classifyAiError(Object.assign(new Error("boom"), { code: "3036" }))).toBeInstanceOf(
      AiQuotaExceededError,
    );
  });

  /** 例外の形は明文化されていないため、メッセージ中のコード番号も見る */
  it("3036 は枠切れとして扱う（メッセージにコードが載っているだけ）", () => {
    const error = new Error("AiError: 3036: You have used up your daily free allocation");
    expect(classifyAiError(error)).toBeInstanceOf(AiQuotaExceededError);
  });

  it("3040 は一時的な混雑として扱う", () => {
    expect(classifyAiError(Object.assign(new Error("boom"), { code: 3040 }))).toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("関係のない例外は翻訳しない", () => {
    expect(classifyAiError(new Error("ネットワークが落ちた"))).toBeNull();
    expect(classifyAiError(Object.assign(new Error("boom"), { code: 5007 }))).toBeNull();
    expect(classifyAiError(undefined)).toBeNull();
  });

  /** 枠切れの文言が「テーマ名を変えて」にならないことは errors.test.ts 側で固定している */
  it("翻訳したエラーは、返すべきAPIのコードを持つ", () => {
    expect(classifyAiError(Object.assign(new Error("x"), { code: 3036 }))).toHaveProperty(
      "code",
      "AI_QUOTA_EXCEEDED",
    );
    expect(classifyAiError(Object.assign(new Error("x"), { code: 3040 }))).toHaveProperty(
      "code",
      "AI_UNAVAILABLE",
    );
  });
});
