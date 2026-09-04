import { buildRomanCandidates, type RomanCandidates } from "./build";

/**
 * 打鍵数。**候補が複数ある場合は最短の候補で数える。**
 *
 * Shiftは打鍵数に数えない（`！` は2キー押下だが1打として計上する）。
 * 漢字かな混じりの文字数では判定しない。「薔薇」2文字＝4打 vs「機械工学」4文字＝14打と
 * 3倍以上ぶれるため。
 */
export function countKeystrokes(candidates: RomanCandidates): number {
  return candidates.reduce(
    (total, unit) => total + Math.min(...unit.map((candidate) => candidate.length)),
    0,
  );
}

/** 読み仮名から直接打鍵数を数える。 */
export function countKeystrokesFromKana(kana: string): number {
  return countKeystrokes(buildRomanCandidates(kana));
}
