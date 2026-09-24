import { katakanaToHiragana } from "@henge/shared";
import { and, desc, eq, ne } from "drizzle-orm";
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

// D1 は1文あたり100個までしかバインド変数を受け付けない。
// 列8項目 × 行数で超過するため、INSERT はこの件数ごとに分ける。
const REPORT_INSERT_CHUNK = 10;

/** 報告を挿入する。複数件はチャンクごとのバッチで。 */
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
  for (let i = 0; i < values.length; i += REPORT_INSERT_CHUNK) {
    await db.insert(readingReports).values(values.slice(i, i + REPORT_INSERT_CHUNK));
  }
  return values.map((v) => v.id);
}

/**
 * 報告の重複判定キー。辞書に書く訂正の単位は（表層, 読み）なので、
 * 文脈（promptText）が違っても同じ訂正は重複とみなす。expectedKana は
 * 承認時にカタカナへ正規化されて残るため、比較はひらがなに寄せる。
 */
const reportKey = (surface: string, expectedKana: string) =>
  `${surface}\t${katakanaToHiragana(expectedKana)}`;

/**
 * すでにキューにある訂正のキー集合（pending / approved / applied）。
 * rejected は含めない — 却下された訂正の再報告は管理者が毎回判断できるよう残す。
 */
async function listReportedKeys(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ surface: readingReports.surface, expectedKana: readingReports.expectedKana })
    .from(readingReports)
    .where(ne(readingReports.status, "rejected"));
  return new Set(rows.map((r) => reportKey(r.surface, r.expectedKana)));
}

/**
 * 既報告と同一の（表層, 読み）を除いて挿入する受付経路。
 * 同一リクエスト内の重複もスキップする。
 */
export async function submitReadingReports(
  db: Db,
  rows: ReadingReportInput[],
): Promise<{ ids: string[]; skipped: number }> {
  const seen = await listReportedKeys(db);
  const fresh: ReadingReportInput[] = [];
  let skipped = 0;
  for (const row of rows) {
    const key = reportKey(row.surface, row.expectedKana);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    fresh.push(row);
  }
  const ids = await insertReadingReports(db, fresh);
  return { ids, skipped };
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
