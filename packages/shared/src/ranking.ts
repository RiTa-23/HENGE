import {
  KEYSTROKE_MAX,
  KEYSTROKE_MIN,
  WORD_KEYSTROKE_MAX,
  WORD_KEYSTROKE_MIN,
} from "./generation/validate";
import { keysPerSecond, type PlayStats } from "./score";
import { playSize, type PromptForm } from "./session";

/** テーマ×形式ごとに保持する件数。101位以下は登録のたびに消す */
export const RANKING_SIZE = 100;

/**
 * 1秒あたりの打鍵数の上限。世界記録級でも20打鍵/秒に届かないので、
 * これを超える申告は打っていない値として弾く。
 */
export const MAX_KEYS_PER_SECOND = 30;

/** 1プレイにかけられる時間の上限。これより長い記録は放置した画面なので受けない */
export const MAX_ELAPSED_MS = 60 * 60 * 1000;

/**
 * 1プレイで打つ最小の打鍵数。お題1問は形式ごとの下限以上の打鍵数を持つので、
 * 問題数 × 下限を下回る申告はあり得ない。
 */
export function minHits(form: PromptForm): number {
  return playSize(form) * (form === "word" ? WORD_KEYSTROKE_MIN : KEYSTROKE_MIN);
}

/**
 * 1プレイで打つ最大の打鍵数。お題の打鍵数は**最短の候補**で数えている
 * （`し` を `shi` と打てば `si` より1打多い）ので、上限そのものではなく2倍を取る。
 */
export function maxHits(form: PromptForm): number {
  return playSize(form) * (form === "word" ? WORD_KEYSTROKE_MAX : KEYSTROKE_MAX) * 2;
}

/**
 * ランキングに登録する記録の範囲検査。**通れば正しい記録、ではない。**
 *
 * 記録はクライアントの自己申告で、改ざんは防げない（MVPでは対策しない）。
 * ここで弾くのは「打っていないと分かる値」だけで、弾く理由を返す。
 * 検査の入口は Next.js の Zod（`refine`）で、規則はここに1つだけ置く。
 */
export function playStatsRejection(stats: PlayStats, form: PromptForm): string | null {
  if (stats.elapsedMs <= 0 || stats.elapsedMs > MAX_ELAPSED_MS) return "時間が範囲外です";
  if (stats.hits < minHits(form) || stats.hits > maxHits(form)) return "打鍵数が範囲外です";
  if (keysPerSecond(stats) > MAX_KEYS_PER_SECOND) return "打鍵速度が範囲外です";
  return null;
}
