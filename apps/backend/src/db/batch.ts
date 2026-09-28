import type { Db } from "./client";

type BatchStatement = Parameters<Db["batch"]>[0][number];

/** db.batch は「1件以上」のタプルを要求するが、種類の違う文を混ぜると型が合わない */
export function asBatch(statements: unknown[]): [BatchStatement, ...BatchStatement[]] {
  return statements as [BatchStatement, ...BatchStatement[]];
}

/**
 * 配列を `size` 件ずつに分ける。
 *
 * **D1のバインド変数の上限は1クエリにつき100個**（db.batch() の中の各文にも個別に適用される）。
 * 複数行の INSERT や `IN (...)` は、この上限に収まるように分けて投げる。
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
