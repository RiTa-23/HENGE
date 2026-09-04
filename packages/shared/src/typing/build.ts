import {
  KANA_TABLE,
  N_ALWAYS,
  NA_ROW_KANA,
  SOKUON_FALLBACK,
  VOWEL_KANA,
  YA_ROW_KANA,
} from "./table";

/** かな1文字ぶんに対応するローマ字候補の配列。`prompts.reading_roman_json` の中身 */
export type RomanCandidates = string[][];

/** テーブルに無いかなが読みに含まれていた場合。呼び出し側はそのお題を却下する */
export class UnsupportedKanaError extends Error {
  constructor(readonly kana: string) {
    super(`ローマ字候補テーブルに無いかなが含まれている: ${kana}`);
    this.name = "UnsupportedKanaError";
  }
}

const VOWEL_LETTERS = new Set(["a", "i", "u", "e", "o"]);

/**
 * 読み仮名を打鍵の単位に切る。拗音・外来語のかなは2文字で1単位。
 */
function splitUnits(kana: string): string[] {
  const units: string[] = [];
  for (let i = 0; i < kana.length; i++) {
    const pair = kana.slice(i, i + 2);
    if (pair.length === 2 && KANA_TABLE[pair] !== undefined) {
      units.push(pair);
      i++;
      continue;
    }
    units.push(kana.slice(i, i + 1));
  }
  return units;
}

/**
 * 「っ」の候補。次のかなの子音を借用する（次が「た」行なら `t`）。
 * 次が母音始まり・文末の場合は借用できないため、`ltu` 等のみ。
 */
function sokuonCandidates(next: string | undefined): string[] {
  const borrowed = new Set<string>();
  for (const candidate of next === undefined ? [] : (KANA_TABLE[next] ?? [])) {
    const head = candidate[0];
    if (head !== undefined && !VOWEL_LETTERS.has(head)) borrowed.add(head);
  }
  return [...borrowed, ...SOKUON_FALLBACK];
}

/**
 * 「ん」の候補。`nn` / `xn` は常に使える。
 * 次が子音始まりのかななら `n` 単体も可（母音・や行・文末の前では認めない）。
 *
 * `n` 単体を母音の前で認めないのは、`ん`+`あ` が `na` となり「な」と区別できなくなるため。
 * HENGEはお題のテキストを知っているので技術的には解決できるが、
 * IMEで通用しない打ち方を許容しない方針に合わせる。
 *
 * **な行の前でも `n` 単体は認めない。** `n`+`な` が `nna` となり「んな」と衝突する。
 * IMEによっては `minna` で「みんな」が打てるが、曖昧さを設計時点で排除する方針を優先する。
 */
function nCandidates(next: string | undefined): string[] {
  if (next === undefined) return [...N_ALWAYS];
  const head = next[0];
  if (head === undefined) return [...N_ALWAYS];
  if (VOWEL_KANA.has(head) || YA_ROW_KANA.has(head) || NA_ROW_KANA.has(head) || head === "ん") {
    return [...N_ALWAYS];
  }
  return ["n", ...N_ALWAYS];
}

/**
 * 読み仮名からローマ字候補の配列を組み立てる。
 *
 * **「ん」「っ」は、次の仮名を先読みできるこの時点で確定させる。**
 * 実行時（打鍵判定中）にバックトラックしないようにするため。
 *
 * @throws {UnsupportedKanaError} テーブルに無いかなが含まれている場合
 */
export function buildRomanCandidates(kana: string): RomanCandidates {
  const units = splitUnits(kana);
  return units.map((unit, index) => {
    const next = units[index + 1];
    if (unit === "っ") return sokuonCandidates(next);
    if (unit === "ん") return nCandidates(next);

    const candidates = KANA_TABLE[unit];
    if (candidates === undefined) throw new UnsupportedKanaError(unit);
    return candidates.slice();
  });
}
