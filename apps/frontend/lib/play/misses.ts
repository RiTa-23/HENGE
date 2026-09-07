/**
 * 1プレイ分の苦手キーの集計。
 *
 * 打鍵エンジンの `TypingProgress.missedKeys` は**1問ごとに作り直される**ため、
 * 15問を通した傾向はここで畳んで持つ。数えているのは「打つべきだったのに
 * 打ち損ねた文字」で、実際に押した誤りのキーではない（`match.ts` 参照）。
 */

/** 1問分の集計を、それまでの合計に足す */
export function mergeMissedKeys(
  total: ReadonlyMap<string, number>,
  round: ReadonlyMap<string, number>,
): Map<string, number> {
  const merged = new Map(total);
  for (const [key, count] of round) merged.set(key, (merged.get(key) ?? 0) + count);
  return merged;
}

export interface MissedKey {
  key: string;
  count: number;
}

/**
 * 多い順に上位を取る。**同数のときはキーの順で並べる。**
 * 並びが実行のたびに変わると、前回との比較ができなくなる。
 */
export function topMissedKeys(missed: ReadonlyMap<string, number>, limit: number): MissedKey[] {
  return [...missed]
    .map(([key, count]) => ({ key, count }))
    .toSorted((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}
