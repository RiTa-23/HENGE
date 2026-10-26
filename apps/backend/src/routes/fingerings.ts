import { Hono } from "hono";
import { createDb } from "../db/client";
import {
  createFingeringPost,
  deleteFingeringPost,
  FINGERING_POSTS_PER_USER,
  getFingeringPost,
  listFingeringPosts,
  pickFingeringPost,
} from "../db/fingerings";
import { fail } from "../http/error";

/**
 * 最適化の運指の投稿。
 *
 * **投稿者か運営かの判定はここでしない**（Next.js 側。不変条件1）。渡された userId を信頼する。
 * 一覧と1件の取得は投稿者の userId を返すが、**公開APIはそれを中継しない**（Next.js 側で
 * 「自分の投稿か」「消せるか」に畳む）。
 */
export const fingeringRoutes = new Hono<{ Bindings: Env }>()
  .get("/fingerings", async (c) => {
    const themeId = c.req.query("themeId") ?? "";
    return c.json({ posts: await listFingeringPosts(createDb(c.env.DB), themeId) });
  })
  .get("/fingerings/:id", async (c) => {
    const post = await getFingeringPost(createDb(c.env.DB), c.req.param("id"));
    if (post === undefined) return fail(c, "NOT_FOUND", "投稿が見つかりません");
    return c.json({ post });
  })
  // 運指の形・標準運指でないこと・説明文の長さは Next.js 側で確かめてある
  .post("/fingerings", async (c) => {
    const body = await c.req.json<{
      themeId: string;
      userId: string;
      fingering: unknown;
      note: string | null;
    }>();
    const result = await createFingeringPost(createDb(c.env.DB), {
      themeId: body.themeId,
      userId: body.userId,
      fingeringJson: JSON.stringify(body.fingering),
      note: body.note,
    });
    if (result.ok) return c.json({ id: result.id });
    if (result.reason === "not_found") return fail(c, "NOT_FOUND", "最適化が見つかりません");
    if (result.reason === "duplicate") {
      return fail(c, "VALIDATION_ERROR", "同じ運指が既に投稿されています。一覧から選んで使えます");
    }
    return fail(
      c,
      "VALIDATION_ERROR",
      `1つの最適化に投稿できる運指は${FINGERING_POSTS_PER_USER}つまでです`,
    );
  })
  .delete("/fingerings/:id", async (c) => {
    await deleteFingeringPost(createDb(c.env.DB), c.req.param("id"));
    return c.json({ ok: true });
  })
  .put("/fingerings/picks", async (c) => {
    const body = await c.req.json<{ userId: string; postId: string }>();
    if (!(await pickFingeringPost(createDb(c.env.DB), body))) {
      return fail(c, "NOT_FOUND", "投稿が見つかりません");
    }
    return c.json({ ok: true });
  });
