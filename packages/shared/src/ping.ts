/**
 * Phase 0 の疎通確認用。両Workerから `packages/shared` を参照できることを示すためだけに置く。
 * Phase 2 以降で実際の共通ロジック（正規化関数・JST日付関数・ローマ字入力エンジン）に置き換わる。
 */
export const PING = "henge";

export function ping(from: string): string {
  return `${PING}:${from}`;
}
