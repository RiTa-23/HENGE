import type { AppType as ReadingAppType } from "@henge/reading";
import { buildRomanCandidates, UnsupportedKanaError } from "@henge/shared";
import { hc } from "hono/client";
import { type GetReadings, ReadingError, type ReadingOutcome } from "./types";

/**
 * 読み Worker（apps/reading、Vibrato + UniDic トリム辞書）による読み取得。
 *
 * Service Binding は HTTP 方式（`Fetcher.fetch`）で呼ぶ。1回の POST でまとめて
 * 投げるので、1ラウンドあたりのサブリクエスト消費は1回。
 * **応答の型は `hc<AppType>` で読み Worker から受け取る**（手書きの型を二重に持たない）。
 * ホスト名は Service Binding では見られないので、パスだけが意味を持つ。
 */
export function createVibratoReadings(reading: Fetcher): GetReadings {
  const client = hc<ReadingAppType>("https://reading", {
    fetch: reading.fetch.bind(reading),
  });

  return async (texts: string[]): Promise<ReadingOutcome[]> => {
    if (texts.length === 0) return [];
    const res = await client.readings.$post({ json: { texts } });
    if (res.status !== 200) {
      throw new ReadingError(`読み Worker が ${res.status} を返した`);
    }

    // 型は hc が保証するが、デプロイの順序がずれた（古い読み Worker が応答した）ときに
    // 壊れた応答を「お題の却下」と取り違えないよう、形だけは実物で確かめる
    const { results } = await res.json();
    if (!Array.isArray(results) || results.length !== texts.length) {
      throw new ReadingError("読み Worker の応答と要求の件数が合わない");
    }

    return texts.map((text, i): ReadingOutcome => {
      const result = results[i]!;
      if ("error" in result) {
        return { ok: false, error: "UNKNOWN_READING", surface: result.surface };
      }
      try {
        // テーブルに無いかなが残っていれば UnsupportedKanaError が飛ぶ。
        // 呼び出し側には辞書の未知語と同じ「そのお題を却下」として返す
        return {
          ok: true,
          reading: { kana: result.kana, roman: buildRomanCandidates(result.kana) },
        };
      } catch (error) {
        if (error instanceof UnsupportedKanaError) {
          return { ok: false, error: "UNKNOWN_READING", surface: text };
        }
        throw error;
      }
    });
  };
}
