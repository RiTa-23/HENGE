import { apiError, type ErrorCode, statusFor } from "@henge/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Hono側のエラー返却。**認可の判定はここでしない**（Next.js側の責務）。
 * Honoが返すのは「処理できなかった理由」だけ。
 */
export function fail(c: Context, code: ErrorCode, message?: string) {
  return c.json(apiError(code, message), statusFor(code) as ContentfulStatusCode);
}

/**
 * AI を呼んだあとのエラー返却。**その回の消費（`neuronsUsed`）を `error` の外に載せる。**
 *
 * 失敗してもニューロンは消費されている（不変条件11）。Next.js はこれを足して
 * 残ニューロンを返し、画面の表示を更新する。`error` の形は {@link fail} と同じ
 */
export function failWithUsage(c: Context, code: ErrorCode, neuronsUsed: number) {
  return c.json({ ...apiError(code), neuronsUsed }, statusFor(code) as ContentfulStatusCode);
}
