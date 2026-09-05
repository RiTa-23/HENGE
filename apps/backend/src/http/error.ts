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
