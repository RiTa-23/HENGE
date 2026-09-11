import { describe, expect, it } from "bun:test";
import * as authSchema from "@henge/shared/db/auth-schema";
import { getAuthTables, parseUserInput } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { auth } from "./auth-cli.config";

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
 *
 * 照合に使うのは**アプリと同じ設定**（`auth-cli.config.ts` が `createAuth` で作る
 * インスタンス）。`additionalFields` で足した列（`displayName`）も要求に含まれるので、
 * `lib/auth.ts` に列を足して `bun run auth:schema` を忘れると、ここで落ちる。
 */
describe("auth-schema は better-auth が要求する形を満たす", () => {
  const tables = getAuthTables(auth.options);

  it.each(Object.entries(tables))("%s テーブルの列がすべて揃っている", (model, definition) => {
    const table = (authSchema as Record<string, unknown>)[model];
    expect(table).toBeDefined();

    const actual = new Set(Object.keys(getTableColumns(table as never)));
    // id は better-auth が暗黙に要求する主キーで、fields には含まれない
    const expected = ["id", ...Object.keys(definition.fields)];

    expect(expected.filter((field) => !actual.has(field))).toEqual([]);
  });
});

/**
 * 表示名の更新は Route Handler を持たず、Better Auth の `/update-user` に
 * `additionalFields.displayName.validator.input`（`displayNameSchema`）で検証を委ねている
 * （`docs/04-api.md`）。その前提は better-auth の内部（`parseUserInput` が
 * `validator.input` を実行すること）に乗っているので、ここで固定する。
 * 外れると 21 文字超や改行入りの名前がそのまま保存され、ランキングの1行が崩れる。
 */
describe("update-user の入口で displayName の検証が走る", () => {
  it("前後の空白を落として通す", () => {
    expect(parseUserInput(auth.options, { displayName: "  影丸 " }, "update")).toEqual({
      displayName: "影丸",
    });
  });

  it("長さ・空・制御文字は弾く", () => {
    for (const displayName of ["あ".repeat(21), "", "   ", "影\n丸"]) {
      expect(() => parseUserInput(auth.options, { displayName }, "update")).toThrow();
    }
  });

  it("サインアップ（create）では未指定でも通り、NULL のまま作られる", () => {
    expect(
      parseUserInput(auth.options, { name: "忍", email: "u@example.com" }, "create"),
    ).not.toHaveProperty("displayName");
  });
});
