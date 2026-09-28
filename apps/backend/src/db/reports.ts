import { katakanaToHiragana } from "@henge/shared";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { asBatch, chunk } from "./batch";
import type { Db } from "./client";
import { readingReports, themes } from "./schema";

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

/**
 * 1つの INSERT 文に載せる報告の数。
 *
 * **D1のバインド変数の上限は1クエリにつき100個。** 報告1件で**9個**使う
 * （id / theme_id / sentence_no / prompt_text / surface / reported_kana /
 * expected_kana / user_id と、既定値を JS 側で持つ status。created_at は SQL の
 * 既定値なのでバインドしない）。10件で90個。列を足すときはここを見直すこと。
 */
const REPORT_INSERT_CHUNK = 10;

/** 報告を挿入する。分割しても1つのバッチに収める（途中までだけ入ることがない）。 */
export async function insertReadingReports(db: Db, rows: ReadingReportInput[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const values = rows.map((row) => ({ id: crypto.randomUUID(), ...row }));
  const inserts = chunk(values, REPORT_INSERT_CHUNK).map((part) =>
    db.insert(readingReports).values(part),
  );
  await db.batch(asBatch(inserts));
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
 * 送られてきた表層について、すでにキューにある訂正のキー集合（pending / approved / applied）。
 * rejected は含めない — 却下された訂正の再報告は管理者が毎回判断できるよう残す。
 *
 * **全件を読まない。** 報告は匿名でも送れるので、1リクエストごとにテーブル全体を
 * 読むと、連投がそのまま D1 の読み取り量になる。1回の報告は最大15件なので、
 * 表層の `IN (...)` はバインド変数の上限に収まる。
 */
async function listReportedKeys(db: Db, surfaces: string[]): Promise<Set<string>> {
  const rows = await db
    .select({ surface: readingReports.surface, expectedKana: readingReports.expectedKana })
    .from(readingReports)
    .where(and(inArray(readingReports.surface, surfaces), ne(readingReports.status, "rejected")));
  return new Set(rows.map((r) => reportKey(r.surface, r.expectedKana)));
}

/** 報告先のテーマが無い。FK 違反の500にせず、呼び出し側で 404 にする */
export class ReportThemeNotFoundError extends Error {
  constructor() {
    super("報告先のテーマが見つかりません");
    this.name = "ReportThemeNotFoundError";
  }
}

/**
 * 既報告と同一の（表層, 読み）を除いて挿入する受付経路。
 * 同一リクエスト内の重複もスキップする。
 */
export async function submitReadingReports(
  db: Db,
  rows: ReadingReportInput[],
): Promise<{ ids: string[]; skipped: number }> {
  const themeIds = [...new Set(rows.map((row) => row.themeId))];
  const found = await db.select({ id: themes.id }).from(themes).where(inArray(themes.id, themeIds));
  if (found.length !== themeIds.length) throw new ReportThemeNotFoundError();

  const seen = await listReportedKeys(db, [...new Set(rows.map((row) => row.surface))]);
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
 * 報告の状態遷移。`from` に現状態の許容一覧を渡し、遷移元が合わなければ
 * 何も書き換えず false を返す（処理済みの二重操作防止と同じ仕組み）。
 * `cost` に null を渡すと確定済みコストを消せる（reopen 時のリセット用）。
 */
export async function updateReadingReportStatus(
  db: Db,
  id: string,
  next: ReportStatus,
  from: ReportStatus | ReportStatus[],
  patch: { expectedKana?: string; cost?: number | null } = {},
): Promise<boolean> {
  const result = await db
    .update(readingReports)
    .set({
      status: next,
      ...(patch.expectedKana !== undefined ? { expectedKana: patch.expectedKana } : {}),
      ...(patch.cost !== undefined ? { cost: patch.cost } : {}),
    })
    .where(
      and(
        eq(readingReports.id, id),
        inArray(readingReports.status, Array.isArray(from) ? from : [from]),
      ),
    );
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
