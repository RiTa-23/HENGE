import { buildRomanCandidates, UnsupportedKanaError } from "@henge/shared";
import { type GetReadings, ReadingError, type ReadingOutcome } from "./types";

/**
 * 読み Worker（apps/reading、Vibrato + UniDic トリム辞書）による読み取得。
 *
 * Service Binding は HTTP 方式（`Fetcher.fetch`）で呼ぶ。1回の POST でまとめて
 * 投げるので、1ラウンドあたりのサブリクエスト消費は1回（Yahoo は件数分）。
 * ホスト名は Service Binding では見られないので、パスだけが意味を持つ。
 */
const PATH = "https://reading/readings";

interface ReadingsResponse {
  results?: ({ kana: string } | { error: "UNKNOWN_READING"; surface: string })[];
}

export function createVibratoReadings(reading: Fetcher): GetReadings {
  return async (texts: string[]): Promise<ReadingOutcome[]> => {
    const res = await reading.fetch(PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });

    if (!res.ok) {
      throw new ReadingError(`読み Worker が ${res.status} を返した`);
    }

    const body = (await res.json()) as ReadingsResponse;
    if (body.results === undefined || body.results.length !== texts.length) {
      throw new ReadingError("読み Worker の応答に results が無い");
    }

    // 長さは上で検証済みなので、入力と同じ index で応答を引ける
    return texts.map((text, i): ReadingOutcome => {
      const result = body.results?.[i];
      if (result === undefined) {
        throw new ReadingError("読み Worker の応答と要求がずれている");
      }
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
