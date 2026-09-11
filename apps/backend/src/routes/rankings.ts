import type { PlayStats, PromptForm } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { getPlayOffset } from "../db/progress";
import { listRankings, registerRanking } from "../db/rankings";
import { getThemeDetail } from "../db/themes";
import { fail } from "../http/error";

interface RegisterBody {
  userId: string;
  themeId: string;
  form: PromptForm;
  stats: PlayStats;
}

/**
 * ランキング。テーマ×形式ごとに上位100件（`RANKING_SIZE`）。
 *
 * 認可の判定はここでしない。`userId` は Next.js 側でセッションから取った値で、
 * 入力の範囲検査（打鍵数・時間）も Next.js 側の Zod で済んでいる。
 *
 * **「そのプールを遊んだか」だけはここで見る。** ログインユーザーの再生オフセット
 * （`user_theme_progress`）はこのWorkerにしか無く、Next.js からは判定できない。
 * 遊んでいないプールへの登録を通すと、プレイせずに記録だけ送れる。
 */
export const rankingRoutes = new Hono<{ Bindings: Env }>()
  .get("/rankings", async (c) => {
    const themeId = c.req.query("themeId") ?? "";
    const form: PromptForm = c.req.query("form") === "word" ? "word" : "sentence";
    return c.json({ entries: await listRankings(createDb(c.env.DB), themeId, form) });
  })
  .post("/rankings", async (c) => {
    const body = (await c.req.json()) as RegisterBody;
    const db = createDb(c.env.DB);

    const theme = await getThemeDetail(db, body.themeId);
    if (theme === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");

    // 一度でも遊んでいればオフセットは1プレイ分以上進んでいる（0なら行が無い）
    const played = (await getPlayOffset(db, body.userId, body.themeId, body.form)) > 0;
    if (!played) return fail(c, "FORBIDDEN", "このお題を遊んでから登録してください");

    return c.json(
      await registerRanking(db, {
        userId: body.userId,
        themeId: body.themeId,
        form: body.form,
        stats: body.stats,
      }),
    );
  });
