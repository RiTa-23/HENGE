import { describe, expect, test } from "bun:test";
import { readJsonBody } from "./json";

/**
 * **エラーを出そうとして落ちる**のがいちばん困る壊れ方。サーバー側の例外や
 * 接続断で本文が空になったとき、`response.json()` は
 * `Unexpected end of JSON input` を投げる。呼び出し側はそのときエラー表示を
 * 組み立てている最中なので、画面ごと落ちる（プレイ画面の「お題を作る」で実際に起きた）。
 */
describe("readJsonBody", () => {
  test("JSONならそのまま読める", async () => {
    const body = await readJsonBody(Response.json({ error: { code: "NOT_FOUND" } }));

    expect(body).toEqual({ error: { code: "NOT_FOUND" } });
  });

  test("本文が空なら null（例外にしない）", async () => {
    expect(await readJsonBody(new Response(null, { status: 500 }))).toBeNull();
  });

  test("JSONでない本文でも null（HTMLのエラーページなど）", async () => {
    expect(await readJsonBody(new Response("<html>500</html>", { status: 500 }))).toBeNull();
  });
});
