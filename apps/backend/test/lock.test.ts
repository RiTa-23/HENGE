import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { acquireThemeLock, isThemeLocked, releaseThemeLock } from "../src/kv/lock";

it("ロックは最初の1件だけが取得できる", async () => {
  expect(await acquireThemeLock(env.KV, "t1", "sentence")).toBe(true);
  expect(await acquireThemeLock(env.KV, "t1", "sentence")).toBe(false);
});

it("解放すれば再び取得できる", async () => {
  await acquireThemeLock(env.KV, "t2", "sentence");
  await releaseThemeLock(env.KV, "t2", "sentence");
  expect(await acquireThemeLock(env.KV, "t2", "sentence")).toBe(true);
});

it("テーマごとに独立している", async () => {
  await acquireThemeLock(env.KV, "t3", "sentence");
  expect(await acquireThemeLock(env.KV, "t4", "sentence")).toBe(true);
});

it("在庫不足時に「生成中」を判定できる", async () => {
  expect(await isThemeLocked(env.KV, "t5", "sentence")).toBe(false);
  await acquireThemeLock(env.KV, "t5", "sentence");
  expect(await isThemeLocked(env.KV, "t5", "sentence")).toBe(true);
});

/**
 * **形式ごとに独立させる。** 1つのキーにまとめると、単語を補充している間は
 * 短文の補充がスキップされる。プールが別なら同時に作って構わない。
 */
it("同じテーマでも、短文のロックは単語の補充を止めない", async () => {
  expect(await acquireThemeLock(env.KV, "t6", "sentence")).toBe(true);

  expect(await acquireThemeLock(env.KV, "t6", "word")).toBe(true);
  expect(await isThemeLocked(env.KV, "t6", "word")).toBe(true);

  await releaseThemeLock(env.KV, "t6", "word");
  // 単語のロックを返しても、短文のロックは残る
  expect(await isThemeLocked(env.KV, "t6", "sentence")).toBe(true);
});
