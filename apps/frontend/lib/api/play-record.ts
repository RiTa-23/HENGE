import {
  type PlayLog,
  type PlayStats,
  playStatsRejection,
  replayPlay,
  type ReplayPrompt,
} from "@henge/shared";
import type { PlayTicket } from "./play-ticket";

export type RecordCheck =
  | { stats: PlayStats }
  | { code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string };

/**
 * チケット（検証済み）と打鍵ログから、ランキングに登録する記録を出す。
 *
 * 1. チケットのお題が、出題順にすべて残っているか（管理画面で消されていれば登録できない）
 * 2. 打鍵ログをそのお題で再生する（`replayPlay`。画面と同じ打鍵エンジン）
 * 3. 再生した記録の範囲検査（`playStatsRejection`。打っていないと分かる値）
 * 4. **実時間の検査。** 発行から今までに経った時間より長くかかった記録はあり得ない。
 *    チケットを受け取った直後に「30秒で打った」ログを作って送っても、30秒経つまで通らない
 *
 * どれも入力の検証なので Next.js 側に置く（Hono は検証済みの値を受け取るだけ）。
 */
export function checkPlayRecord(params: {
  ticket: PlayTicket;
  log: PlayLog;
  prompts: readonly ReplayPrompt[];
  now: number;
}): RecordCheck {
  const { ticket, log, prompts, now } = params;
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const ordered: ReplayPrompt["readingRoman"][] = [];
  for (const id of ticket.promptIds) {
    const prompt = byId.get(id);
    if (prompt === undefined || prompt.themeId !== ticket.themeId || prompt.form !== ticket.form) {
      return { code: "NOT_FOUND", message: "お題が見つからないため、この記録は登録できません" };
    }
    ordered.push(prompt.readingRoman);
  }

  const replayed = replayPlay(ordered, log);
  if ("rejection" in replayed) return { code: "VALIDATION_ERROR", message: replayed.rejection };

  const reason = playStatsRejection(replayed.stats, ticket.form);
  if (reason !== null) return { code: "VALIDATION_ERROR", message: reason };

  if (replayed.stats.elapsedMs > now - ticket.iat) {
    return { code: "VALIDATION_ERROR", message: "打鍵の記録が実際の時間と合いません" };
  }
  return { stats: replayed.stats };
}
