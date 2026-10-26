import type { ThemeKind } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import {
  findOrCreateMixTheme,
  findOrCreateMixThemes,
  findThemeByName,
  getThemeCreator,
  getThemeDetail,
  LIST_LIMIT_DEFAULT,
  listThemes,
  setDefaultFingering,
} from "../db/themes";
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

    // おまかせ・ごちゃまぜは決まった名前の行だけ。**引かれたら無ければ作る**
    // （`findOrCreateMixTheme`）。知らない名前は作らずに空を返す。一覧は全モード
    if (kind === "mix") {
      if (name === undefined) {
        return c.json({ themes: await findOrCreateMixThemes(db), nextCursor: null });
      }
      const found = await findOrCreateMixTheme(db, name);
      return c.json({ themes: found === null ? [] : [found], nextCursor: null });
    }

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
    if (theme === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");
    return c.json({ theme });
  })
  // 作成者。**公開APIで中継しない**（利用者のIDを出さない）。既定の運指を変えてよいかを
  // Next.js 側で判定するためだけに使う
  .get("/themes/:id/creator", async (c) => {
    const found = await getThemeCreator(createDb(c.env.DB), c.req.param("id"));
    if (found === undefined) return fail(c, "NOT_FOUND", "テーマが見つかりません");
    return c.json(found);
  })
  // 最適化の既定の運指を書き換える。**作成者か運営かの判定は Next.js 側で済んでいる**。
  // 運指の形も Next.js 側で音と照らしてある
  .put("/themes/default-fingering", async (c) => {
    const { themeId: id, defaultFingering } = await c.req.json<{
      themeId: string;
      defaultFingering: unknown;
    }>();
    const db = createDb(c.env.DB);
    if (!(await setDefaultFingering(db, id, defaultFingering))) {
      return fail(c, "NOT_FOUND", "最適化が見つかりません");
    }
    return c.json({ theme: await getThemeDetail(db, id) });
  });
