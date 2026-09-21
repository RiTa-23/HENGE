import { createVibratoReadings } from "./vibrato";
import { createYahooReading } from "./yahoo";
import { fromSingle, type GetReadings } from "./types";

export {
  fromSingle,
  ReadingError,
  type GetReading,
  type GetReadings,
  type Reading,
  type ReadingOutcome,
} from "./types";

/**
 * Yahoo の結果を使いつつ、裏で読み Worker も呼んで不一致を `console.log` に出す。
 * 切り替え前に本番で一致率を見るためのモード。読み Worker 側の失敗は
 * ログに残すだけで、生成には Yahoo の結果を返す。
 */
function createShadowReadings(env: Env): GetReadings {
  const primary = fromSingle(createYahooReading(env.YAHOO_APP_ID));
  const shadow = createVibratoReadings(env.READING);
  return async (texts) => {
    const [main, side] = await Promise.all([
      primary(texts),
      shadow(texts).then(
        (outcomes) => ({ ok: true as const, outcomes }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    ]);

    if (!side.ok) {
      console.log("[reading:shadow] 読み Worker の呼び出しに失敗", side.error);
    } else {
      for (const [i, outcome] of main.entries()) {
        const theirs = side.outcomes[i];
        const yahoo = outcome.ok ? outcome.reading.kana : "UNKNOWN";
        const vibrato = theirs?.ok ? theirs.reading.kana : "UNKNOWN";
        if (yahoo !== vibrato) {
          console.log(`[reading:shadow] 不一致: ${texts[i]} / yahoo=${yahoo} vibrato=${vibrato}`);
        }
      }
    }
    return main;
  };
}

/**
 * 読み取得の実装を選ぶ唯一の場所。差し替えるときは `READING_PROVIDER` だけを変える。
 * `yahoo` / `vibrato` / `shadow`（Yahoo で返しつつ Vibrato と突合してログに出す）。
 * 未設定は `yahoo`（従来どおりの挙動）。
 */
export function createGetReadings(env: Env): GetReadings {
  // wrangler types が vars の値から literal 型を生成するので、切り替え時に
  // case が型で弾かれないよう string に広げてから見る
  const provider: string = env.READING_PROVIDER;
  switch (provider) {
    case "vibrato":
      return createVibratoReadings(env.READING);
    case "shadow":
      return createShadowReadings(env);
    default:
      return fromSingle(createYahooReading(env.YAHOO_APP_ID));
  }
}
