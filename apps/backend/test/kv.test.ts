import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { THEME_LOCK_TTL_SECONDS, themeIdKey, themeLockKey } from "../src/kv/keys";

it("テーマIDのキーは kind を含む（テーマ「ざ」と含む文字「ざ」を区別するため）", () => {
  expect(themeIdKey("theme", "ざ")).toBe("theme:theme:ざ");
  expect(themeIdKey("constraint", "ざ")).toBe("theme:constraint:ざ");
  expect(themeIdKey("theme", "ざ")).not.toBe(themeIdKey("constraint", "ざ"));
});

it("ロックのキーはテーマIDごとに分かれる", () => {
  expect(themeLockKey("t1")).toBe("theme:t1:lock");
  expect(themeLockKey("t1")).not.toBe(themeLockKey("t2"));
});

it("ロックのTTLはKVの下限60秒を下回らない", () => {
  expect(THEME_LOCK_TTL_SECONDS).toBeGreaterThanOrEqual(60);
});

it("組み立てたキーでKVを読み書きできる", async () => {
  await env.KV.put(themeIdKey("theme", "忍びの心得"), "t1");
  expect(await env.KV.get(themeIdKey("theme", "忍びの心得"))).toBe("t1");

  await env.KV.put(themeLockKey("t1"), "1", { expirationTtl: THEME_LOCK_TTL_SECONDS });
  expect(await env.KV.get(themeLockKey("t1"))).toBe("1");
});
