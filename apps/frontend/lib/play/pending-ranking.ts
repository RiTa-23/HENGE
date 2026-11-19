import type { PlayLog, PromptForm } from "@henge/shared";

/**
 * ログイン前に遊んだ記録。結果画面で「Googleでログイン」を押したときに退避し、
 * ログインから戻ったプレイ画面で「ログイン前の記録を登録する」に使う。
 *
 * 結果は React の状態にしか無く、OAuth のリダイレクトで消える。**同じタブなら
 * sessionStorage はリダイレクトをまたいで残る**ので、ここに置く。localStorage にしないのは、
 * 別のタブや翌日に開いたときまで「ログイン前の記録」が出てくると何の記録か分からないため。
 *
 * 置くのは利用者のブラウザだけで、サーバーには送らない（不変条件10）。登録のときに
 * 送るのはチケットと打鍵ログで、記録はサーバーが再生して出す（`docs/04-api.md`）。
 */
export interface PendingRanking {
  themeId: string;
  form: PromptForm;
  ticket: string;
  log: PlayLog;
  /** 画面に出すスコア（結果画面の値）。登録で使うのはサーバーが再生して出した値 */
  score: number;
  /** 退避した時刻（エポックミリ秒） */
  savedAt: number;
}

const KEY = "henge:pending-ranking";

/**
 * 退避した記録を出しておく長さ。チケット自体は2時間通るが、ログインとユーザー名を
 * 決めるのにそこまではかからない。長く残すと、何の記録か分からないまま出てくる
 */
export const PENDING_RANKING_TTL_MS = 30 * 60 * 1000;

/** sessionStorage が使えない環境（プライベートウィンドウ等）でも落とさない */
function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isPending(value: unknown): value is PendingRanking {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  const log = p.log as Record<string, unknown> | null | undefined;
  return (
    typeof p.themeId === "string" &&
    (p.form === "sentence" || p.form === "word" || p.form === "long") &&
    typeof p.ticket === "string" &&
    typeof log === "object" &&
    log !== null &&
    typeof log.keys === "string" &&
    Array.isArray(log.t) &&
    typeof p.score === "number" &&
    typeof p.savedAt === "number"
  );
}

/**
 * 退避した文字列を読む。**このプールの、期限内の記録だけ**を返す。
 * 壊れた値・別のプールの記録・期限切れは null（呼び出し側は何も出さない）
 */
export function parsePendingRanking(
  raw: string | null,
  { themeId, form, now }: { themeId: string; form: PromptForm; now: number },
): PendingRanking | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPending(value)) return null;
  if (value.themeId !== themeId || value.form !== form) return null;
  if (now - value.savedAt > PENDING_RANKING_TTL_MS) return null;
  return value;
}

export function savePendingRanking(pending: PendingRanking): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(pending));
  } catch {
    // 容量超過・書き込み禁止。ログイン後に登録できないだけで、ログインはできる
  }
}

export function readPendingRanking(themeId: string, form: PromptForm): PendingRanking | null {
  return parsePendingRanking(storage()?.getItem(KEY) ?? null, { themeId, form, now: Date.now() });
}

/** 登録した・期限が切れた記録を消す。**1つの記録は1回だけ出す** */
export function clearPendingRanking(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // 消せなくても、期限（PENDING_RANKING_TTL_MS）で出なくなる
  }
}
