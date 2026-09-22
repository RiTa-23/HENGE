import { Hono } from "hono";
import { createDb } from "../db/client";
import {
  insertReadingReports,
  listReadingReports,
  markReadingReportsApplied,
  REPORT_LIST_LIMIT_DEFAULT,
  updateReadingReportStatus,
  type ReportStatus,
} from "../db/reports";
import { fail } from "../http/error";

/**
 * 読み違い報告の内部API。認証・検証は Next.js 側で済んでいる。
 *
 * 承認済み行を外部のワークフロー（辞書リポジトリの GitHub Actions）が
 * 取り出せるように、`/admin/reading-reports` は status 絞り込みを持つ。
 */

const STATUSES = new Set<ReportStatus>(["pending", "approved", "rejected", "applied"]);

export const reportRoutes = new Hono<{ Bindings: Env }>()
  /** ユーザー報告の受付。1〜15件のバッチ。 */
  .post("/reading-reports", async (c) => {
    const rows = await c.req.json<
      {
        themeId: string;
        sentenceNo: number;
        promptText: string;
        surface: string;
        reportedKana: string;
        expectedKana: string;
        userId: string | null;
      }[]
    >();
    const db = createDb(c.env.DB);
    const ids = await insertReadingReports(db, rows);
    return c.json({ inserted: ids.length, ids });
  })
  /**
   * 報告一覧。管理画面（pending）と自動PRワークフロー（approved）の両方が使う。
   * `/admin/reading-reports?status=…&limit=…&cursor=…`
   */
  .get("/admin/reading-reports", async (c) => {
    const raw = c.req.query("status") ?? "pending";
    const status = STATUSES.has(raw as ReportStatus) ? (raw as ReportStatus) : "pending";
    const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
    const cursor = Number.parseInt(c.req.query("cursor") ?? "", 10);
    const db = createDb(c.env.DB);
    return c.json(
      await listReadingReports(db, {
        status,
        limit: Number.isNaN(limit) ? REPORT_LIST_LIMIT_DEFAULT : Math.min(limit, 200),
        cursor: Number.isNaN(cursor) || cursor < 0 ? 0 : cursor,
      }),
    );
  })
  /**
   * 承認/却下。承認時は expectedKana（カタカナ正規化済み）と cost を確定する。
   * body: { id, action: "approve" | "reject", expectedKana?, cost? }
   */
  .patch("/admin/reading-reports", async (c) => {
    const body = await c.req.json<{
      id: string;
      action: "approve" | "reject";
      expectedKana?: string;
      cost?: number;
    }>();
    if (body.action !== "approve" && body.action !== "reject") {
      return fail(c, "VALIDATION_ERROR", "action は approve か reject です");
    }
    const db = createDb(c.env.DB);
    const ok = await updateReadingReportStatus(
      db,
      body.id,
      body.action === "approve" ? "approved" : "rejected",
      { expectedKana: body.expectedKana, cost: body.cost },
    );
    if (!ok) return fail(c, "NOT_FOUND", "対象の報告が見つからないか処理済みです");
    return c.json({ id: body.id, status: body.action === "approve" ? "approved" : "rejected" });
  })
  /**
   * 自動PRワークフローからの適用完了通知。body: { ids: string[] }
   * approved → applied にだけ進む（pending を飛び越えない）。
   */
  .post("/admin/reading-reports/applied", async (c) => {
    const { ids } = await c.req.json<{ ids: string[] }>();
    const db = createDb(c.env.DB);
    const done = await markReadingReportsApplied(db, ids ?? []);
    return c.json({ applied: done });
  });
