import { Hono } from "hono";
import { createDb } from "../db/client";
import { LIST_LIMIT_DEFAULT, listThemesByCreator } from "../db/themes";

/**
 * 利用者ごとの情報（マイページ用）。
 *
 * 認可の判定はここでしない。`userId` は Next.js 側でセッションから取った値で、
 * このWorkerは外部公開されておらず Service Bindings 経由でしか呼ばれない。
 * 「本人の一覧しか見せない」は Next.js が自分のIDしか渡さないことで成立している。
 *
 * `userId` をパスではなくクエリで受けるのは `/admin/prompts` と同じ理由。Hono RPC は
 * バリデータを置かない限りパスパラメータとクエリを同時に型推論できず、検証は
 * Next.js 側に置く規約なので、型のためだけにバリデータを増やさない。
 */
export const userRoutes = new Hono<{ Bindings: Env }>().get("/users/themes", async (c) => {
  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const cursor = Number.parseInt(c.req.query("cursor") ?? "", 10);
  return c.json(
    await listThemesByCreator(createDb(c.env.DB), {
      userId: c.req.query("userId") ?? "",
      limit: Number.isNaN(limit) ? LIST_LIMIT_DEFAULT : limit,
      cursor: Number.isNaN(cursor) || cursor < 0 ? 0 : cursor,
    }),
  );
});
