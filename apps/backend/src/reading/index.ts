import { createVibratoReadings } from "./vibrato";
import type { GetReadings } from "./types";

export {
  fromSingle,
  ReadingError,
  type GetReading,
  type GetReadings,
  type Reading,
  type ReadingOutcome,
} from "./types";

/**
 * 読み取得の実装は読み Worker（Vibrato + UniDic トリム辞書）の1つだけ。
 * 呼び出し側は必ずこの関数を経由する（読み Worker を直接叩かない）。
 */
export function createGetReadings(env: Env): GetReadings {
  return createVibratoReadings(env.READING);
}
