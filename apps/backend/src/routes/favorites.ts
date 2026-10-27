import { Hono } from "hono";
import { createDb } from "../db/client";
import { addFavorite, isFavorite, listFavorites, removeFavorite } from "../db/favorites";
import { fail } from "../http/error";

/**
 * お気に入り（マイページ・詳細ページ用）。
 *
 * **認可の判定はここでしない**（Next.js 側。不変条件1）。`userId` は Next.js がセッションから
 * 取った本人のIDで、「本人のお気に入りしか見せない・触らせない」は Next.js が自分のIDしか
 * 渡さないことで成立している（`/users/themes` と同じ）。
 */
export const favoriteRoutes = new Hono<{ Bindings: Env }>()
  .get("/favorites", async (c) => {
    const userId = c.req.query("userId") ?? "";
    return c.json({ themes: await listFavorites(createDb(c.env.DB), userId) });
  })
  .get("/favorites/status", async (c) => {
    const favorited = await isFavorite(createDb(c.env.DB), {
      userId: c.req.query("userId") ?? "",
      themeId: c.req.query("themeId") ?? "",
    });
    return c.json({ favorited });
  })
  .put("/favorites", async (c) => {
    const body = await c.req.json<{ userId: string; themeId: string }>();
    if (!(await addFavorite(createDb(c.env.DB), body))) {
      return fail(c, "NOT_FOUND", "テーマが見つかりません");
    }
    return c.json({ favorited: true });
  })
  .delete("/favorites", async (c) => {
    const body = await c.req.json<{ userId: string; themeId: string }>();
    await removeFavorite(createDb(c.env.DB), body);
    return c.json({ favorited: false });
  });
