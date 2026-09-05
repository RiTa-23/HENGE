import { DAILY_GENERATION_LIMIT } from "./session";

/**
 * 本日の生成残数。count が上限を超えている場合（並行リクエストで判定と加算の間に
 * ずれ込んだ場合）は0に張り付ける。マイナスの残数を UI に表示しないため。
 */
export function remainingQuota(count: number): number {
  return Math.max(0, DAILY_GENERATION_LIMIT - count);
}

/**
 * 生成を許可するか。新規作成・再生成のクォータ判定と、バックグラウンド補充の
 * 許可フラグ（allowRefill）の両方に使う。**判定は Next.js 側で行う。**
 */
export function canGenerate(count: number): boolean {
  return remainingQuota(count) > 0;
}
