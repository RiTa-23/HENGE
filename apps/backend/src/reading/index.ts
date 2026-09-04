import { createYahooReading } from "./yahoo";
import type { GetReading } from "./types";

export { ReadingError, type GetReading, type Reading } from "./types";

/**
 * 読み取得の実装を選ぶ唯一の場所。差し替えるときはここだけを変える。
 */
export function createGetReading(env: Env): GetReading {
  return createYahooReading(env.YAHOO_APP_ID);
}
