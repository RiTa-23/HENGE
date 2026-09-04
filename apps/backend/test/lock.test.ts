import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { acquireThemeLock, isThemeLocked, releaseThemeLock } from "../src/kv/lock";

it("ロックは最初の1件だけが取得できる", async () => {
  expect(await acquireThemeLock(env.KV, "t1")).toBe(true);
  expect(await acquireThemeLock(env.KV, "t1")).toBe(false);
});

it("解放すれば再び取得できる", async () => {
  await acquireThemeLock(env.KV, "t2");
  await releaseThemeLock(env.KV, "t2");
  expect(await acquireThemeLock(env.KV, "t2")).toBe(true);
});

it("テーマごとに独立している", async () => {
  await acquireThemeLock(env.KV, "t3");
  expect(await acquireThemeLock(env.KV, "t4")).toBe(true);
});

it("在庫不足時に「生成中」を判定できる", async () => {
  expect(await isThemeLocked(env.KV, "t5")).toBe(false);
  await acquireThemeLock(env.KV, "t5");
  expect(await isThemeLocked(env.KV, "t5")).toBe(true);
});
