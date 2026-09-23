import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { readingReports } from "./schema";

export type ReportStatus = "pending" | "approved" | "rejected" | "applied";

export interface ReadingReportInput {
  themeId: string;
  sentenceNo: number;
  promptText: string;
  surface: string;
  reportedKana: string;
  expectedKana: string;
  userId: string | null;
}

export interface ReadingReportRow extends ReadingReportInput {
  id: string;
  status: ReportStatus;
  cost: number | null;
  createdAt: number;
  appliedAt: number | null;
}

export const REPORT_LIST_LIMIT_DEFAULT = 50;

/** 報告を挿入する。複数件は1バッチで。 */
export async function insertReadingReports(db: Db, rows: ReadingReportInput[]): Promise<string[]> {
  const values = rows.map((row) => ({
    id: crypto.randomUUID(),
    themeId: row.themeId,
    sentenceNo: row.sentenceNo,
    promptText: row.promptText,
    surface: row.surface,
    reportedKana: row.reportedKana,
    expectedKana: row.expectedKana,
    userId: row.userId,
  }));
  await db.insert(readingReports).values(values);
  return values.map((v) => v.id);
}

export interface ReportListParams {
  status: ReportStatus;
  limit: number;
  cursor: number;
}

/**
 * 管理画面（pending）とワークフロー（approved）の一覧取得。
 * cursor はオフセット方式（取得済み件数）。created 降順で安定しない部分は
 * id で割る。
 */
export async function listReadingReports(
  db: Db,
  { status, limit, cursor }: ReportListParams,
): Promise<ReadingReportRow[]> {
  return db
    .select()
    .from(readingReports)
    .where(eq(readingReports.status, status))
    .orderBy(desc(readingReports.createdAt), desc(readingReports.id))
    .limit(limit)
    .offset(cursor) as Promise<ReadingReportRow[]>;
}

/**
 * 承認/却下。承認時は expectedKana をカタカナ正規化した値とコスト値を確定する。
 * 存在しない id には false を返す。
 */
export async function updateReadingReportStatus(
  db: Db,
  id: string,
  next: Exclude<ReportStatus, "pending" | "applied">,
  patch: { expectedKana?: string; cost?: number } = {},
): Promise<boolean> {
  const result = await db
    .update(readingReports)
    .set({
      status: next,
      ...(patch.expectedKana !== undefined ? { expectedKana: patch.expectedKana } : {}),
      ...(patch.cost !== undefined ? { cost: patch.cost } : {}),
    })
    .where(and(eq(readingReports.id, id), eq(readingReports.status, "pending")));
  return (result.meta.changes ?? 0) > 0;
}

/** ワークフローがPRを出した後に呼ぶ。applied_at を刻む。 */
export async function markReadingReportsApplied(db: Db, ids: string[]): Promise<number> {
  const results = await Promise.all(
    ids.map((id) =>
      db
        .update(readingReports)
        .set({ status: "applied", appliedAt: Math.floor(Date.now() / 1000) })
        .where(and(eq(readingReports.id, id), eq(readingReports.status, "approved"))),
    ),
  );
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}
