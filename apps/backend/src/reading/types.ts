import { type RomanCandidates, UnsupportedKanaError } from "@henge/shared";

export interface Reading {
  /** ひらがなの読み */
  kana: string;
  /** かな→ローマ字候補の配列。`prompts.reading_roman_json` に保存する */
  roman: RomanCandidates;
}

/**
 * 読み仮名の取得。**必ずこの抽象を経由すること。読み Worker を直接呼ばない。**
 *
 * 実装は読み Worker（Vibrato + UniDic トリム辞書）の1つ。プロバイダが
 * 変わったときに呼び出し側を直さなくて済むように、入口はここに閉じる。
 */
export type GetReading = (text: string) => Promise<Reading>;

/**
 * 1件分の読み取得の結果。`UNKNOWN_READING` は「辞書に読みが無い」または
 * 「読みに打鍵テーブル外のかなが残った」場合で、呼び出し側はそのお題を却下する。
 * API の障害はここでは表さず、GetReadings 自体が例外を投げる。
 */
export type ReadingOutcome =
  | { ok: true; reading: Reading }
  | { ok: false; error: "UNKNOWN_READING"; surface: string };

/**
 * 読み仮名のバッチ取得。読み Worker への Service Binding は1回の fetch で
 * まとめて投げる（呼び出しも外部サブリクエストに数えるため）。
 */
export type GetReadings = (texts: string[]) => Promise<ReadingOutcome[]>;

/** 1件ずつ呼ぶ実装をバッチ形に畳む。テストで注入する偽の実装を作るためのもの */
export function fromSingle(getReading: GetReading): GetReadings {
  return async (texts) =>
    Promise.all(
      texts.map(async (text): Promise<ReadingOutcome> => {
        try {
          return { ok: true, reading: await getReading(text) };
        } catch (error) {
          if (error instanceof UnsupportedKanaError) {
            return { ok: false, error: "UNKNOWN_READING", surface: text };
          }
          throw error;
        }
      }),
    );
}

export class ReadingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReadingError";
  }
}
