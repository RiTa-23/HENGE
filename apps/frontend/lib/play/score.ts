/**
 * 結果の集計。**e-typing と同じ算出方法に合わせる**。
 *
 * - WPM = **ミスを含む総打鍵数**を1分に換算した値
 * - 正確率 = 正確に打てた数 ÷ 総打鍵数
 * - スコア = WPM ×（正確率）^3 の小数点以下切り捨て
 *
 * WPMの分子にミスを含めるのが要点。ミスを除いた「正しく打てた数」で速さを
 * 数えると、ミスの分がスコアから二重に引かれる（正確率の3乗でも引かれるため）。
 *
 * 正確率が3乗で効くので、速さより正確さの影響が大きい。
 */
export interface PlayStats {
  /** 正しく受理された打鍵の数 */
  hits: number;
  /** ミス打鍵の延べ回数 */
  misses: number;
  /** 15問にかかった時間（ミリ秒） */
  elapsedMs: number;
}

/** ミスを含む総打鍵数 */
export function totalKeystrokes({ hits, misses }: PlayStats): number {
  return hits + misses;
}

/** 1秒あたりの打鍵数。分あたりに直すと e-typing の WPM になる */
export function keysPerSecond(stats: PlayStats): number {
  if (stats.elapsedMs <= 0) return 0;
  return totalKeystrokes(stats) / (stats.elapsedMs / 1000);
}

/** 正確率（0〜1）。打鍵が1つも無いときは1とする */
export function accuracyRatio(stats: PlayStats): number {
  const total = totalKeystrokes(stats);
  return total === 0 ? 1 : stats.hits / total;
}

/** e-typing と同じスコア。WPM ×（正確率）^3 を切り捨てる */
export function etypingScore(stats: PlayStats): number {
  const wpm = keysPerSecond(stats) * 60;
  return Math.floor(wpm * accuracyRatio(stats) ** 3);
}
