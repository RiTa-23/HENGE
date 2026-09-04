import { env } from "cloudflare:test";
import { expect, it } from "vitest";

// Phase 0: D1 / KV / Workers AI のバインディングが解決することの確認。
// スキーマとキー設計そのものは Phase 2 で作る。

it("D1 バインディングでクエリを実行できる", async () => {
  const row = await env.DB.prepare("select 1 as n").first<{ n: number }>();
  expect(row?.n).toBe(1);
});

it("KV バインディングで読み書きできる", async () => {
  await env.KV.put("phase0:ping", "1", { expirationTtl: 60 });
  expect(await env.KV.get("phase0:ping")).toBe("1");
});

it("Workers AI のバインディングが存在する", () => {
  // 実行はニューロンを消費するため、ここでは存在確認のみ。
  expect(env.AI).toBeDefined();
});
