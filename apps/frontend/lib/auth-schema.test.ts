import { describe, expect, it } from "bun:test";
import * as authSchema from "@henge/shared/db/auth-schema";
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";

/**
 * `packages/shared/src/db/auth-schema.ts` は `@better-auth/cli generate` の出力で、
 * 手では書かない。だからこそ **better-auth 本体と CLI の版がずれると壊れる**。
 *
 * 実際、better-auth 1.7 は account に issuer 列を足したが CLI は 1.4 のままで、
 * スキーマに issuer が無いまま 1.7 を入れるとログインが
 * 「The field "issuer" does not exist in the schema」で500になった。
 * ブラウザでOAuthを最後まで通さないと気付けない壊れ方なので、ここで固定する。
 *
 * better-auth を上げるときにこのテストが落ちたら、CLI も同じ版に上げて
 * スキーマを再生成すること（CLIが未対応なら本体を上げない）。
 */
describe("auth-schema は better-auth が要求する形を満たす", () => {
  const tables = getAuthTables({});

  it.each(Object.entries(tables))("%s テーブルの列がすべて揃っている", (model, definition) => {
    const table = (authSchema as Record<string, unknown>)[model];
    expect(table).toBeDefined();

    const actual = new Set(Object.keys(getTableColumns(table as never)));
    // id は better-auth が暗黙に要求する主キーで、fields には含まれない
    const expected = ["id", ...Object.keys(definition.fields)];

    expect(expected.filter((field) => !actual.has(field))).toEqual([]);
  });
});
