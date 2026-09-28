import type { RomanCandidates } from "@henge/shared";

export interface Reading {
  /** ひらがなの読み */
  kana: string;
  /** かな→ローマ字候補の配列。`prompts.reading_roman_json` に保存する */
  roman: RomanCandidates;
}

/**
 * 1件分の読み取得の結果。`UNKNOWN_READING` は「辞書に読みが無い」または
 * 「読みに打鍵テーブル外のかなが残った」場合で、呼び出し側はそのお題を却下する。
 * API の障害はここでは表さず、GetReadings 自体が例外を投げる。
 */
export type ReadingOutcome =
  | { ok: true; reading: Reading }
  | { ok: false; error: "UNKNOWN_READING"; surface: string };

/**
 * 読み仮名のバッチ取得。**必ずこの抽象（`createGetReadings()`）を経由すること。
 * 読み Worker を直接呼ばない。**
 *
 * 実装は読み Worker（Vibrato + UniDic トリム辞書）の1つ。プロバイダが
 * 変わったときに呼び出し側を直さなくて済むように、入口はここに閉じる。
 * 読み Worker への Service Binding は1回の fetch でまとめて投げる
 * （呼び出しも外部サブリクエストに数えるため）。
 */
export type GetReadings = (texts: string[]) => Promise<ReadingOutcome[]>;

export class ReadingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReadingError";
  }
}
