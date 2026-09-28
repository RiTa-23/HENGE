import { UnsupportedKanaError } from "@henge/shared";
import type { GetReadings, Reading, ReadingOutcome } from "../src/reading/index";

/** 1件ずつ読みを返す偽の実装。テストではこちらを書き、`fromSingle` でバッチ形に畳む */
export type GetReading = (text: string) => Promise<Reading>;

/**
 * 1件ずつ呼ぶ実装をバッチ形（`GetReadings`）に畳む。**テスト専用。**
 * 本番の読み取得は読み Worker へのバッチ1回で、1件ずつの実装は無い。
 */
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
