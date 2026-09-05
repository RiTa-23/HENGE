/**
 * APIのエラーコード。**新しいコードを増やす前に、既存で表現できないか確認すること。**
 *
 * `RATE_LIMITED` と `QUOTA_EXCEEDED` はどちらも429だが、前者は数秒、後者は日付が変わるまで
 * 解消しない。案内文が変わるためコードで区別する。
 */
export const ERROR_STATUS = {
  /** Zod検証に失敗 */
  VALIDATION_ERROR: 400,
  /** 未ログインで要認証エンドポイントを叩いた */
  UNAUTHORIZED: 401,
  /** 管理者以外が /api/admin/* を叩いた。クライアントには404相当に見せる */
  FORBIDDEN: 403,
  /** プールが尽きた。匿名は別テーマ／ログイン、ログインは再生成へ誘導する */
  THEME_EXHAUSTED: 409,
  /** 在庫不足だが生成ロックがある。クォータを消費せず、数秒後に再試行させる */
  GENERATION_IN_PROGRESS: 409,
  /** リトライ上限でも目標に届かなかった。テーマ名の変更を促す */
  GENERATION_FAILED: 422,
  /** Rate Limiting が弾いた */
  RATE_LIMITED: 429,
  /** 日次の生成上限に到達 */
  QUOTA_EXCEEDED: 429,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "入力の形式が正しくありません",
  UNAUTHORIZED: "ログインが必要です",
  FORBIDDEN: "見つかりません",
  THEME_EXHAUSTED: "このテーマのお題を使い切りました",
  GENERATION_IN_PROGRESS: "お題を準備しています。少し待ってからもう一度お試しください",
  GENERATION_FAILED: "お題を作れませんでした。テーマ名を変えてお試しください",
  RATE_LIMITED: "続けて実行しすぎです。少し待ってからお試しください",
  QUOTA_EXCEEDED: "本日の生成上限に達しました",
};

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

export function apiError(code: ErrorCode, message?: string): ApiErrorBody {
  return { error: { code, message: message ?? DEFAULT_MESSAGE[code] } };
}

export function statusFor(code: ErrorCode): number {
  return ERROR_STATUS[code];
}

/** レスポンスがエラー形式かどうか。Worker間で受け取った結果の判別に使う */
export function isApiError(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  return typeof (error as { code?: unknown }).code === "string";
}
