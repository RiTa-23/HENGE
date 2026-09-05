import { describe, expect, test } from "bun:test";
import { apiError, ERROR_STATUS, isApiError, statusFor } from "./index";

describe("エラーコードとHTTPステータス", () => {
  test("docs/04-api.md のエラーコード表と一致する", () => {
    expect(ERROR_STATUS).toEqual({
      VALIDATION_ERROR: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      THEME_EXHAUSTED: 409,
      GENERATION_IN_PROGRESS: 409,
      GENERATION_FAILED: 422,
      RATE_LIMITED: 429,
      QUOTA_EXCEEDED: 429,
    });
  });

  test("RATE_LIMITED と QUOTA_EXCEEDED は同じ429だが別のコード", () => {
    // 前者は数秒、後者は日付が変わるまで解消しない。案内文が変わるため区別する
    expect(statusFor("RATE_LIMITED")).toBe(statusFor("QUOTA_EXCEEDED"));
    expect(apiError("RATE_LIMITED").error.message).not.toBe(
      apiError("QUOTA_EXCEEDED").error.message,
    );
  });
});

describe("apiError", () => {
  test("コードごとの既定メッセージを持つ", () => {
    expect(apiError("QUOTA_EXCEEDED")).toEqual({
      error: { code: "QUOTA_EXCEEDED", message: "本日の生成上限に達しました" },
    });
  });

  test("メッセージを差し替えられる", () => {
    expect(apiError("QUOTA_EXCEEDED", "残り0回です").error.message).toBe("残り0回です");
  });

  test("FORBIDDEN は管理画面の存在を悟らせない文言にする", () => {
    expect(apiError("FORBIDDEN").error.message).toBe("見つかりません");
  });
});

describe("isApiError", () => {
  test("エラー形式を判別する", () => {
    expect(isApiError(apiError("UNAUTHORIZED"))).toBe(true);
  });

  test("正常なレスポンスは誤判定しない", () => {
    expect(isApiError({ prompts: [], nextOffset: 15 })).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError("error")).toBe(false);
  });
});
