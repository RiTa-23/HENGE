/**
 * APIのエラーコード。**新しいコードを増やす前に、既存で表現できないか確認すること。**
 *
 * `RATE_LIMITED` と `QUOTA_EXCEEDED` はどちらも429だが、前者は数秒、後者は日付が変わるまで
 * 解消しない。案内文が変わるためコードで区別する。
 *
 * `QUOTA_EXCEEDED` と `AI_QUOTA_EXCEEDED` も同じ理由で分ける。前者は**その利用者**の
 * 500ニューロン、後者は**アカウント全体**の無料枠で、後者は他の利用者にも同時に起きる。
 */
export const ERROR_STATUS = {
  /** Zod検証に失敗 */
  VALIDATION_ERROR: 400,
  /** 未ログインで要認証エンドポイントを叩いた */
  UNAUTHORIZED: 401,
  /** 管理者以外が /api/admin/* を叩いた。クライアントには404相当に見せる */
  FORBIDDEN: 403,
  /** 指定されたものが存在しない。入力の形式は正しい */
  NOT_FOUND: 404,
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
  /**
   * **アカウント全体の**生成枠（Workers AI の無料枠）を使い切った。
   * 利用者個人の `QUOTA_EXCEEDED` とは別物で、名前を変えても打ち直しても直らない。
   * 翌 00:00 UTC まで解消しない。
   */
  AI_QUOTA_EXCEEDED: 429,
  /** Workers AI 側が一時的に混み合っている（Out of Capacity）。数分で直りうる */
  AI_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "入力の形式が正しくありません",
  UNAUTHORIZED: "ログインが必要です",
  FORBIDDEN: "見つかりません",
  // FORBIDDEN と同じ文言。権限が無いのか存在しないのかを区別させない
  NOT_FOUND: "見つかりません",
  THEME_EXHAUSTED: "このテーマのお題を使い切りました",
  GENERATION_IN_PROGRESS: "お題を準備しています。少し待ってからもう一度お試しください",
  GENERATION_FAILED: "お題を作れませんでした。テーマ名を変えてお試しください",
  RATE_LIMITED: "続けて実行しすぎです。少し待ってからお試しください",
  QUOTA_EXCEEDED: "本日の生成上限に達しました",
  // **テーマ名の問題ではないと分かる文言にする。** GENERATION_FAILED と同じ
  // 「名前を変えて」を出すと、直らない原因に対して打ち直しを促すことになる
  AI_QUOTA_EXCEEDED: "本日はこれ以上お題を作れません。日本時間の朝9時に枠が戻ります",
  AI_UNAVAILABLE: "いま混み合っています。少し待ってからお試しください",
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
