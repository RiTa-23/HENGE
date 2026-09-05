import { Hono } from "hono";
import { createDb } from "../db/client";
import { deleteTheme, LIST_LIMIT_DEFAULT, listThemesForAdmin } from "../db/themes";
import { listUsers, USER_LIST_LIMIT_DEFAULT } from "../db/users";
import { fail } from "../http/error";
import { releaseThemeLock } from "../kv/lock";
import { deleteCachedThemeId } from "../kv/themes";

/**
 * 管理用の内部API。
 *
 * **管理者かどうかの判定はここでしない。** `ADMIN_EMAILS` による判定は Next.js 側の
 * 責務で、このWorkerに届いた時点で認可は済んでいる（外部公開されておらず、
 * Service Bindings 経由でしか呼ばれない）。両方に判定を置くと、ずれたときに気付けない。
 */

/** limit / cursor のクエリを読む。不正な値は既定値に落とす（検証は Next.js 側で済んでいる） */
function pagination(
  query: (name: string) => string | undefined,
  defaultLimit: number,
): { limit: number; cursor: number } {
  const limit = Number.parseInt(query("limit") ?? "", 10);
  const cursor = Number.parseInt(query("cursor") ?? "", 10);
  return {
    limit: Number.isNaN(limit) ? defaultLimit : limit,
    cursor: Number.isNaN(cursor) || cursor < 0 ? 0 : cursor,
  };
}

export const adminRoutes = new Hono<{ Bindings: Env }>()
  .get("/admin/themes", async (c) => {
    const db = createDb(c.env.DB);
    return c.json(
      await listThemesForAdmin(db, pagination(c.req.query.bind(c.req), LIST_LIMIT_DEFAULT)),
    );
  })
  .delete("/admin/themes/:id", async (c) => {
    const themeId = c.req.param("id");
    const db = createDb(c.env.DB);

    // 消す前に正規化キーを受け取る。消した後ではKVのキーを組み立てられない
    const deleted = await deleteTheme(db, themeId);
    if (deleted === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");

    // **KVは明示的に消す。** D1のCASCADEはD1の中でしか効かないため、
    // 消し忘れると削除したテーマがキャッシュ経由で復活したように見える
    await deleteCachedThemeId(c.env.KV, deleted.kind, deleted.normalizedName);
    // 削除の瞬間に補充が走っていた場合に備えてロックも落とす（TTL任せにしない）
    await releaseThemeLock(c.env.KV, themeId);

    return c.json({ deleted: true, themeId });
  })
  .get("/admin/users", async (c) => {
    const db = createDb(c.env.DB);
    return c.json(
      await listUsers(db, pagination(c.req.query.bind(c.req), USER_LIST_LIMIT_DEFAULT)),
    );
  });
