import type { RomanCandidates } from "@henge/shared";

export interface Reading {
  /** ひらがなの読み */
  kana: string;
  /** かな→ローマ字候補の配列。`prompts.reading_roman_json` に保存する */
  roman: RomanCandidates;
}

/**
 * 読み仮名の取得。**必ずこの抽象を経由すること。Yahoo APIを直接呼ばない。**
 *
 * Yahoo! JLP は個人での商用利用が不可のため、将来の差し替えが確定している。
 * 後から挟むのでは間に合わない。
 */
export type GetReading = (text: string) => Promise<Reading>;

export class ReadingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReadingError";
  }
}
