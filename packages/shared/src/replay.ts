import type { PlayStats } from "./score";
import type { PromptForm } from "./session";
import type { RomanCandidates } from "./typing/build";
import { pressKey, startTyping } from "./typing/match";

/**
 * 1プレイの打鍵ログ。**判定に流した打鍵だけ**を、流した順に持つ。
 *
 * - `keys`: 正規化後のキー（`normalizeTypedKey` を通った1文字）を連結したもの
 * - `t`: 各打鍵の、開始（`startedAt`）からの経過ミリ秒（整数）。`keys` と同じ長さ
 *
 * IMEのキーや Esc のように判定に流さなかったものは入れない。入れると、
 * 画面で数えなかったミスが再生では数えられて、画面とランキングの数字がずれる。
 */
export interface PlayLog {
  keys: string;
  t: number[];
}

/**
 * 打鍵ログの長さの上限。どの形式の上限打鍵数（`maxHits`）にミスを足しても届かない
 * 大きさにしてある。ここで弾くのは「再生する前から明らかに大きすぎるもの」だけで、
 * 打鍵数の範囲は再生した後に `playStatsRejection` で見る。
 */
export const MAX_PLAY_LOG_KEYS = 10_000;

/**
 * 再生に使うお題の読み。Hono が ID で引いて返し、Next.js がチケットの出題順に並べ直す。
 * テーマ・形式も持つのは、チケットのお題と同じプールのものかを確かめるため。
 */
export interface ReplayPrompt {
  id: string;
  themeId: string;
  form: PromptForm;
  readingRoman: RomanCandidates;
}

export type ReplayResult = { stats: PlayStats } | { rejection: string };

/**
 * 打鍵ログを、画面と**同じ打鍵エンジン**（`startTyping` / `pressKey`）で再生して、
 * 打鍵数・ミス数・時間を出す。ランキングの登録で、クライアントの申告の代わりに使う。
 *
 * 画面と同じ関数を通すので、画面のスコアとランキングのスコアがずれない。
 * 打ち方の指定（`chosen`）は表示だけで受理に効かないので、ここでは渡さない。
 *
 * 時間は**最後の打鍵の時刻**。プレイ画面の計時も最後の打鍵で止めている
 * （`PlayScreen` の `finishing`）。
 *
 * 弾くもの（記録として成り立たないもの）:
 * - `keys` と `t` の長さが違う、時刻が0未満・整数でない・前の打鍵より前
 * - 全問を打ち終わらない（途中でやめた／別のお題のログ）
 * - 打ち終えた後にまだキーがある
 */
export function replayPlay(prompts: readonly RomanCandidates[], log: PlayLog): ReplayResult {
  const keys = [...log.keys];
  if (keys.length !== log.t.length) return { rejection: "打鍵の記録が壊れています" };

  let previous = 0;
  for (const time of log.t) {
    if (!Number.isInteger(time) || time < previous) {
      return { rejection: "打鍵の記録が壊れています" };
    }
    previous = time;
  }

  let hits = 0;
  let misses = 0;
  let index = 0;
  for (const units of prompts) {
    let progress = startTyping(units);
    while (!progress.finished) {
      const key = keys[index];
      if (key === undefined) return { rejection: "お題を最後まで打っていません" };
      progress = pressKey(progress, key);
      index++;
    }
    hits += progress.hitCount;
    misses += progress.missCount;
  }
  if (index !== keys.length) return { rejection: "打鍵の記録がお題と合いません" };

  return { stats: { hits, misses, elapsedMs: log.t.at(-1) ?? 0 } };
}
