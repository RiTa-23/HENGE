import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import {
  insertReadingReports,
  listReadingReports,
  markReadingReportsApplied,
  updateReadingReportStatus,
} from "../src/db/reports";
import { readingReports, themes, user } from "../src/db/schema";

const db = createDb(env.DB);

async function seed() {
  await db.insert(user).values({
    id: "u1",
    name: "忍",
    email: "u1@example.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(themes).values({
    id: "t1",
    kind: "theme",
    name: "夏祭りの屋台",
    normalizedName: "夏祭りの屋台",
    createdBy: "u1",
  });
}

beforeEach(async () => {
  await db.delete(readingReports);
  await db.delete(themes);
  await db.delete(user);
  await seed();
});

const base = {
  themeId: "t1",
  sentenceNo: 3,
  promptText: "かき氷の店が混んでいた",
  surface: "かき氷",
  reportedKana: "かきこおりのみせがこんでいた",
  expectedKana: "かきごおり",
  userId: null,
};

describe("reading_reports", () => {
  it("匿名ユーザー（userId=null）の報告を挿入して pending で読める", async () => {
    const id = (await insertReadingReports(db, [base]))[0]!;
    const rows = await listReadingReports(db, { status: "pending", limit: 50, cursor: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.status).toBe("pending");
  });

  it("バッチ挿入は件数分の id を返す", async () => {
    const ids = await insertReadingReports(db, [base, { ...base, sentenceNo: 4 }]);
    expect(ids).toHaveLength(2);
    const rows = await listReadingReports(db, { status: "pending", limit: 50, cursor: 0 });
    expect(rows).toHaveLength(2);
  });

  it("スキーマ上限の15件でもチャンク分割して挿入できる", async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ ...base, sentenceNo: i + 1 }));
    const ids = await insertReadingReports(db, rows);
    expect(ids).toHaveLength(15);
    expect(await listReadingReports(db, { status: "pending", limit: 50, cursor: 0 })).toHaveLength(
      15,
    );
  });

  it("ログインユーザーの報告は userId が残る", async () => {
    await insertReadingReports(db, [{ ...base, userId: "u1" }]);
    const rows = await listReadingReports(db, { status: "pending", limit: 50, cursor: 0 });
    expect(rows[0]?.userId).toBe("u1");
  });

  it("approve は status を approved にし、pending 一覧から消える", async () => {
    const id = (await insertReadingReports(db, [base]))[0]!;
    const ok = await updateReadingReportStatus(db, id, "approved", {
      expectedKana: "カキゴオリ",
      cost: -20000,
    });
    expect(ok).toBe(true);
    expect(await listReadingReports(db, { status: "pending", limit: 50, cursor: 0 })).toHaveLength(
      0,
    );
    const approved = await listReadingReports(db, {
      status: "approved",
      limit: 50,
      cursor: 0,
    });
    expect(approved).toHaveLength(1);
    expect(approved[0]?.expectedKana).toBe("カキゴオリ");
    expect(approved[0]?.cost).toBe(-20000);
  });

  it("処理済みの報告を二度承認しようとしても弾かれる", async () => {
    const id = (await insertReadingReports(db, [base]))[0]!;
    expect(await updateReadingReportStatus(db, id, "rejected")).toBe(true);
    expect(await updateReadingReportStatus(db, id, "approved")).toBe(false);
  });

  it("applied は approved からのみ進む", async () => {
    const id = (await insertReadingReports(db, [base]))[0]!;
    // pending のまま applied にしようとしても変化しない
    expect(await markReadingReportsApplied(db, [id])).toBe(0);
    await updateReadingReportStatus(db, id, "approved");
    expect(await markReadingReportsApplied(db, [id])).toBe(1);
    const rows = await listReadingReports(db, { status: "applied", limit: 50, cursor: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appliedAt).not.toBeNull();
  });

  it("テーマ削除で報告も CASCADE で消える", async () => {
    await insertReadingReports(db, [base]);
    await db.delete(themes);
    const rows = await listReadingReports(db, { status: "pending", limit: 50, cursor: 0 });
    expect(rows).toHaveLength(0);
  });
});
