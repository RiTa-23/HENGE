import type { ThemeKind } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { findThemeByName, getThemeDetail, LIST_LIMIT_DEFAULT, listThemes } from "../db/themes";
import { fail } from "../http/error";

/**
 * テーマ／含む文字の取得。
 *
 * 認可の判定はここでしない。このWorkerは外部公開されておらず、
 * Next.js Worker から Service Bindings 経由でしか呼ばれない。
 */
export const themeRoutes = new Hono<{ Bindings: Env }>()
  .get("/themes", async (c) => {
    const kind = (c.req.query("kind") ?? "theme") as ThemeKind;
    const sort = c.req.query("sort") === "recent" ? "recent" : "popular";
    const name = c.req.query("name");
    const db = createDb(c.env.DB);

    // 表示名での絞り込み。テーマ詳細ページ（/themes/[name]）の解決に使う
    if (name !== undefined) {
      const found = await findThemeByName(db, kind, name);
      return c.json({ themes: found === null ? [] : [found], nextCursor: null });
    }

    const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
    const cursor = Number.parseInt(c.req.query("cursor") ?? "", 10);
    return c.json(
      await listThemes(db, {
        kind,
        sort,
        limit: Number.isNaN(limit) ? LIST_LIMIT_DEFAULT : limit,
        cursor: Number.isNaN(cursor) || cursor < 0 ? 0 : cursor,
      }),
    );
  })
  .get("/themes/:id", async (c) => {
    const theme = await getThemeDetail(createDb(c.env.DB), c.req.param("id"));
    if (theme === null) return fail(c, "VALIDATION_ERROR", "テーマが見つかりません");
    return c.json({ theme });
  });
