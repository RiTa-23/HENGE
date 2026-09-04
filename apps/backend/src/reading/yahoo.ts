import { buildRomanCandidates, katakanaToHiragana } from "@henge/shared";
import { type GetReading, ReadingError, type Reading } from "./types";

/**
 * Yahoo! JLP ルビ振りAPI による読み取得。
 *
 * - POST限定・JSON-RPC 2.0
 * - アプリケーションIDは User-Agent ヘッダーに入れる
 * - 1日50,000回・1分300回の制限（全ティア共有）
 *
 * **この呼び出しは Workers無料プランの外部サブリクエスト上限（1実行50回）を消費する。**
 * お題1件につき1回呼ぶため、生成のラウンド数と件数がここに直結する。
 */
const ENDPOINT = "https://jlp.yahooapis.jp/jsonrpc";

interface FuriganaResponse {
  result?: { word?: { surface: string; furigana?: string }[] };
  error?: { message?: string };
}

export function createYahooReading(appId: string): GetReading {
  return async function getReading(text: string): Promise<Reading> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `Yahoo AppID: ${appId}`,
      },
      body: JSON.stringify({
        id: "henge",
        jsonrpc: "2.0",
        method: "jlp.furiganaservice.furigana",
        // grade 1（小学1年生相当）ですべての漢字にふりがなを振らせる
        params: { q: text, grade: 1 },
      }),
    });

    if (!res.ok) {
      throw new ReadingError(`ルビ振りAPIが ${res.status} を返した`);
    }

    const body = (await res.json()) as FuriganaResponse;
    if (body.error !== undefined) {
      throw new ReadingError(`ルビ振りAPIがエラーを返した: ${body.error.message ?? "詳細不明"}`);
    }

    const words = body.result?.word;
    if (words === undefined) {
      throw new ReadingError("ルビ振りAPIの応答に word が無い");
    }

    // 漢字を含まない語には furigana が返らないため、表記をカタカナ→ひらがな変換して使う
    const kana = words.map((word) => word.furigana ?? katakanaToHiragana(word.surface)).join("");

    // テーブルに無いかなが残っていれば UnsupportedKanaError が飛ぶ。
    // 呼び出し側はそのお題を却下する。
    return { kana, roman: buildRomanCandidates(kana) };
  };
}
