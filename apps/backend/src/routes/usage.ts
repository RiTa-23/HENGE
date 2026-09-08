import { Hono } from "hono";
import { createDb } from "../db/client";
import { getUsage } from "../db/usage";

/**
 * 当日の消費。クォータの「判定」は Next.js 側が行うため、ここは生の値を返すだけ。
 * 上限との比較・許可の判断は呼び出し側の責務（**上限値をHono側に持たない**）。
 *
 * 認可判定を持たない。渡された userId を信頼する（Next.js 側で検証済み）。
 */
export const usageRoutes = new Hono<{ Bindings: Env }>().get("/usage/:userId", async (c) => {
  const db = createDb(c.env.DB);
  return c.json(await getUsage(db, c.req.param("userId")));
});
