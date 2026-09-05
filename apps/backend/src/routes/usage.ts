import { Hono } from "hono";
import { createDb } from "../db/client";
import { getUsageCount } from "../db/usage";

/**
 * 当日の生成回数。クォータの「判定」は Next.js 側が行うため、ここは
 * 生のカウントを返すだけ。上限との比較・許可の判断は呼び出し側の責務。
 *
 * 認可判定を持たない。渡された userId を信頼する（Next.js 側で検証済み）。
 */
export const usageRoutes = new Hono<{ Bindings: Env }>().get("/usage/:userId", async (c) => {
  const db = createDb(c.env.DB);
  return c.json({ count: await getUsageCount(db, c.req.param("userId")) });
});
