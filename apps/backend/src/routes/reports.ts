import { hiraganaToKatakana } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import {
  findReadingReport,
  listReadingReports,
  markReadingReportsApplied,
  REPORT_LIST_LIMIT_DEFAULT,
  ReportThemeNotFoundError,
  submitReadingReports,
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
    try {
      const { ids, skipped } = await submitReadingReports(db, rows);
      return c.json({ inserted: ids.length, skipped, ids });
    } catch (error) {
      if (error instanceof ReportThemeNotFoundError) return fail(c, "NOT_FOUND", error.message);
      throw error;
    }
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
    const reports = await listReadingReports(db, {
      status,
      limit: Number.isNaN(limit) ? REPORT_LIST_LIMIT_DEFAULT : Math.min(limit, 200),
      cursor: Number.isNaN(cursor) || cursor < 0 ? 0 : cursor,
    });
    return c.json({ reports });
  })
  /**
   * 報告の状態遷移。body: { id, action, expectedKana?, cost? }
   *
   * - approve: pending → approved。expectedKana と cost を確定する。expectedKana を
   *   省けば申告値を確定する
   * - reject:  pending|approved → rejected
   * - reopen:  approved|rejected → pending。確定済み cost はリセットする
   * - edit:    pending のまま expectedKana だけ更新（運営の読み修正）
   *
   * **読みはここでカタカナに揃える。** user-lex.csv の読みの列はカタカナで、辞書リポジトリの
   * 検証はカタカナ以外を弾く。正規化を画面にだけ任せると、API から直接承認したときに
   * ひらがなのまま approved になり、自動PRのワークフローが毎回そこで止まる。
   *
   * 承認済みを reject / reopen すると、辞書リポジトリの自動PR（apply-reports）は次の実行で
   * 承認済みの集合から PR を作り直すので、開いている PR からもその行が外れる。
   * PR がマージされて applied に閉じた報告は取り消せない（辞書側で行を消す）。
   */
  .patch("/admin/reading-reports", async (c) => {
    const body = await c.req.json<{
      id: string;
      action: "approve" | "reject" | "reopen" | "edit";
      expectedKana?: string;
      cost?: number;
    }>();
    const db = createDb(c.env.DB);
    let ok: boolean;
    let status: ReportStatus;
    switch (body.action) {
      case "approve": {
        status = "approved";
        const kana = body.expectedKana ?? (await findReadingReport(db, body.id))?.expectedKana;
        ok = await updateReadingReportStatus(db, body.id, "approved", "pending", {
          expectedKana: kana === undefined ? undefined : hiraganaToKatakana(kana),
          cost: body.cost,
        });
        break;
      }
      case "reject":
        status = "rejected";
        ok = await updateReadingReportStatus(db, body.id, "rejected", ["pending", "approved"]);
        break;
      case "reopen":
        status = "pending";
        ok = await updateReadingReportStatus(db, body.id, "pending", ["approved", "rejected"], {
          cost: null,
        });
        break;
      case "edit":
        status = "pending";
        if (body.expectedKana === undefined) {
          return fail(c, "VALIDATION_ERROR", "edit には expectedKana が必要です");
        }
        ok = await updateReadingReportStatus(db, body.id, "pending", "pending", {
          expectedKana: hiraganaToKatakana(body.expectedKana),
        });
        break;
      default:
        return fail(c, "VALIDATION_ERROR", "action は approve/reject/reopen/edit です");
    }
    if (!ok) return fail(c, "NOT_FOUND", "対象の報告が見つからないか遷移できない状態です");
    return c.json({ id: body.id, status });
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
