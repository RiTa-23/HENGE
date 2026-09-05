import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { themes, user, userGenerationUsage } from "../src/db/schema";
import { incrementUsage } from "../src/db/usage";

/**
 * Hono Worker は外部に公開されず、Service Bindings 経由で Next.js からしか
 * 呼ばれない。だから**渡された userId を検証せずに信頼してよい**（不変条件1）。
 *
 * ここで固定するのは「Honoが認可判定を持たない」こと。将来ここにセッション検証や
 * 管理者判定を足すと、Next.js 側と二重管理になり、ずれたときに気付けなくなる。
 * 外部から直接叩けないことの確認は wrangler.jsonc（`workers_dev: false`、
 * routes 無し）と本番デプロイ時に行う。
 */

const db = createDb(env.DB);

beforeEach(async () => {
  await db.delete(userGenerationUsage);
  await db.delete(themes);
  await db.delete(user);
});

describe("Honoは認可判定を持たない", () => {
  it("認証ヘッダが無くても /usage/:userId は渡された userId で答える", async () => {
    await db.insert(user).values({
      id: "u1",
      name: "忍",
      email: "u1@example.com",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await incrementUsage(db, "u1");

    const res = await SELF.fetch("http://backend/usage/u1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
  });

  it("認証ヘッダが無くても /admin/* は 401/403 を返さない（管理者判定はNext.js側）", async () => {
    const res = await SELF.fetch("http://backend/admin/themes");

    expect(res.status).toBe(200);
  });

  it("偽のセッションCookieを付けても結果は変わらない（Cookieを見ていない）", async () => {
    const withCookie = await SELF.fetch("http://backend/admin/themes", {
      headers: { Cookie: "better-auth.session_token=forged" },
    });
    const without = await SELF.fetch("http://backend/admin/themes");

    expect(withCookie.status).toBe(without.status);
    expect(await withCookie.json()).toEqual(await without.json());
  });
});
