import { type PlayStats, parsePromptForm, type PromptForm } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { fetchPromptsByIds } from "../db/prompts";
import { listRankings, registerRanking } from "../db/rankings";
import { getThemeDetail } from "../db/themes";
import { fail } from "../http/error";
import { rankingTicketKey } from "../kv/keys";

interface RegisterBody {
  userId: string;
  themeId: string;
  form: PromptForm;
  /** Next.js が打鍵ログを再生して出した記録（クライアントの申告ではない） */
  stats: PlayStats;
  /** プレイチケットの印（`jti`）。**使い捨てにする** */
  ticketId: string;
  /** 印を残しておく秒数（チケットの有効期限まで） */
  ticketTtlSeconds: number;
}

/** KV の TTL の下限。これより短い値は KV が受け付けない */
const KV_MIN_TTL_SECONDS = 60;

/**
 * ランキング。テーマ×形式ごとに上位100件（`RANKING_SIZE`）。
 *
 * 認可の判定はここでしない。`userId` は Next.js 側でセッションから取った値で、
 * 記録（`stats`）も Next.js がプレイチケットを検証し、打鍵ログを再生して出したもの
 * （`apps/frontend/lib/api/play-record.ts`）。
 *
 * **ここで見るのはチケットの使い回しだけ。** 使い捨ての印は KV にしか置けない
 * （KV はこのWorkerにしか無い）。
 */
export const rankingRoutes = new Hono<{ Bindings: Env }>()
  .get("/rankings", async (c) => {
    const themeId = c.req.query("themeId") ?? "";
    const form = parsePromptForm(c.req.query("form"));
    return c.json({ entries: await listRankings(createDb(c.env.DB), themeId, form) });
  })
  /**
   * 打鍵ログの再生に使うお題の読み。Next.js がチケットのお題IDで引く。
   * 消されたお題は返らない（件数が足りなければ Next.js が登録を断る）
   */
  .post("/rankings/prompts", async (c) => {
    const { ids } = await c.req.json<{ ids: string[] }>();
    return c.json({ prompts: await fetchPromptsByIds(createDb(c.env.DB), ids) });
  })
  .post("/rankings", async (c) => {
    const body = await c.req.json<RegisterBody>();
    const db = createDb(c.env.DB);

    const theme = await getThemeDetail(db, body.themeId);
    if (theme === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");

    // **同じチケットで2回登録させない。** KV に比較交換は無いので、数秒以内の
    // 二重送信はすり抜けうるが、同じプレイの同じ記録でベストしか残らないので害は無い
    const key = rankingTicketKey(body.ticketId);
    if ((await c.env.KV.get(key)) !== null) {
      return fail(c, "FORBIDDEN", "この記録は登録済みです");
    }

    const result = await registerRanking(db, {
      userId: body.userId,
      themeId: body.themeId,
      form: body.form,
      stats: body.stats,
    });
    await c.env.KV.put(key, "1", {
      expirationTtl: Math.max(body.ticketTtlSeconds, KV_MIN_TTL_SECONDS),
    });
    return c.json(result);
  });
