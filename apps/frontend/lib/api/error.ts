import { apiError, type ErrorCode, statusFor } from "@henge/shared";

/** 公開APIのエラー返却。認証・認可・入力検証の失敗はここを通る */
export function errorResponse(code: ErrorCode, message?: string): Response {
  return Response.json(apiError(code, message), { status: statusFor(code) });
}
