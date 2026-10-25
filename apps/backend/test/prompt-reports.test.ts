import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import {
  appendPrompts,
  countPrompts,
  fetchPromptPage,
  insertThemeWithPrompts,
  listPromptsForAdmin,
  listReportedPrompts,
  nextSequenceNumber,
  recentPromptTexts,
  reportPrompts,
  restoreReportedPrompt,
} from "../src/db/prompts";
import { getThemeDetail, listThemesForAdmin } from "../src/db/themes";
import { prompts, themes, user } from "../src/db/schema";
import type { ValidPrompt } from "../src/generation/batch";

const db = createDb(env.DB);

function item(text: string): ValidPrompt {
  return { text, readingKana: "あ", readingRomanJson: "[]", keystrokeCount: 12 };
}

const theme = {
  id: "t1",
  kind: "theme" as const,
  name: "忍びの心得",
  normalizedName: "忍びの心得",
  createdBy: null,
};

/** 連番順に並べた短文の id（1始まりの連番 n は ids[n-1]） */
async function sentenceIds(): Promise<string[]> {
  const rows = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(eq(prompts.form, "sentence"))
    .orderBy(prompts.sequenceNumber);
  return rows.map((row) => row.id);
}

beforeEach(async () => {
  await db.delete(prompts);
  await db.delete(themes);
  await db.delete(user);
  await db.insert(user).values({
    id: "u1",
    name: "忍",
    email: "u1@example.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await insertThemeWithPrompts(db, theme, [item("一"), item("二"), item("三")], "model-x");
});

describe("報告したお題はその場で配信から外れる", () => {
  it("配信（fetchPromptPage）に出なくなり、後ろのお題が手前に詰まる", async () => {
    const [first] = await sentenceIds();
    expect(
      await reportPrompts(db, { promptIds: [first!], reason: "unnatural", userId: "u1" }),
    ).toBe(1);

    const page = await fetchPromptPage(db, "t1", "sentence", 0, 10);
    expect(page.map((p) => p.text)).toEqual(["二", "三"]);
  });

  it("在庫数（countPrompts とテーマ詳細・管理一覧の件数）からも外れる", async () => {
    // 片方だけ外すと「在庫はあるのに1プレイ分揃わない」ずれが出る
    const [first] = await sentenceIds();
    await reportPrompts(db, { promptIds: [first!], reason: "other", userId: "u1" });

    expect(await countPrompts(db, "t1", "sentence")).toBe(2);
    expect((await getThemeDetail(db, "t1"))?.promptCounts.sentence).toBe(2);
    const admin = await listThemesForAdmin(db, { limit: 10, cursor: 0 });
    expect(admin.themes[0]?.promptCounts.sentence).toBe(2);
  });

  it("全部外してもテーマ自体は見つかる（在庫0として扱う）", async () => {
    await reportPrompts(db, { promptIds: await sentenceIds(), reason: "other", userId: "u1" });

    const detail = await getThemeDetail(db, "t1");
    expect(detail).not.toBeNull();
    expect(detail?.promptCounts.sentence).toBe(0);
  });

  it("採番は外したお題も数える（MAX+1 が既存の番号と衝突しない）", async () => {
    const ids = await sentenceIds();
    await reportPrompts(db, { promptIds: [ids[2]!], reason: "other", userId: "u1" });

    expect(await nextSequenceNumber(db, "t1", "sentence")).toBe(4);
    await appendPrompts(db, "t1", "sentence", [item("四")], "model-x");
    expect(await countPrompts(db, "t1", "sentence")).toBe(3);
  });

  it("重複回避の文脈には外したお題も残す（同じおかしな文を作らせない）", async () => {
    const ids = await sentenceIds();
    await reportPrompts(db, { promptIds: [ids[2]!], reason: "unnatural", userId: "u1" });

    expect(await recentPromptTexts(db, "t1", "sentence", 10)).toContain("三");
  });

  it("管理画面のお題一覧には外したお題も出し、外れていることが分かる", async () => {
    const [first] = await sentenceIds();
    await reportPrompts(db, { promptIds: [first!], reason: "unnatural", userId: "u1" });

    const { prompts: rows } = await listPromptsForAdmin(db, "t1", "sentence", {
      limit: 10,
      cursor: 0,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]?.reportedAt).not.toBeNull();
    expect(rows[1]?.reportedAt).toBeNull();
  });
});

describe("報告の重複・取り消し", () => {
  it("報告中のお題をもう一度報告しても書き換えない（最初の報告者と理由を残す）", async () => {
    const [first] = await sentenceIds();
    await reportPrompts(db, { promptIds: [first!], reason: "unnatural", userId: "u1" });
    expect(await reportPrompts(db, { promptIds: [first!], reason: "other", userId: "u2" })).toBe(0);

    const [row] = await db.select().from(prompts).where(eq(prompts.id, first!));
    expect(row?.reportReason).toBe("unnatural");
    expect(row?.reportedBy).toBe("u1");
  });

  it("存在しない id は数えない。同じ id の重複も1件として扱う", async () => {
    const [first] = await sentenceIds();
    expect(
      await reportPrompts(db, {
        promptIds: [first!, first!, "missing"],
        reason: "other",
        userId: "u1",
      }),
    ).toBe(1);
  });

  it("復帰すると配信に戻り、報告の情報は消える", async () => {
    const [first] = await sentenceIds();
    await reportPrompts(db, { promptIds: [first!], reason: "unnatural", userId: "u1" });

    expect(await restoreReportedPrompt(db, first!)).toBe(true);
    expect(await countPrompts(db, "t1", "sentence")).toBe(3);
    const [row] = await db.select().from(prompts).where(eq(prompts.id, first!));
    expect(row?.reportedAt).toBeNull();
    expect(row?.reportedBy).toBeNull();
    expect(row?.reportReason).toBeNull();
  });

  it("報告中でないお題の復帰は false（二重操作で何も書き換えない）", async () => {
    const [first] = await sentenceIds();
    expect(await restoreReportedPrompt(db, first!)).toBe(false);
  });

  it("報告者が退会しても報告中のまま残る（reported_by だけ NULL）", async () => {
    // マイグレーションで ON DELETE SET NULL を手で足している。無いと退会が FK で落ちる
    const [first] = await sentenceIds();
    await reportPrompts(db, { promptIds: [first!], reason: "unnatural", userId: "u1" });

    await db.delete(user).where(eq(user.id, "u1"));
    const [row] = await db.select().from(prompts).where(eq(prompts.id, first!));
    expect(row?.reportedAt).not.toBeNull();
    expect(row?.reportedBy).toBeNull();
  });
});

describe("管理画面の報告キュー", () => {
  it("報告中のお題だけを、テーマ名つきで返す", async () => {
    const [first] = await sentenceIds();
    await reportPrompts(db, { promptIds: [first!], reason: "off_theme", userId: "u1" });

    const { prompts: rows, nextCursor } = await listReportedPrompts(db, { limit: 10, cursor: 0 });
    expect(nextCursor).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first,
      text: "一",
      themeName: "忍びの心得",
      themeKind: "theme",
      form: "sentence",
      reportReason: "off_theme",
      reportedBy: "u1",
    });
  });

  it("続きがあれば nextCursor を返す", async () => {
    await reportPrompts(db, { promptIds: await sentenceIds(), reason: "other", userId: "u1" });

    const page = await listReportedPrompts(db, { limit: 2, cursor: 0 });
    expect(page.prompts).toHaveLength(2);
    expect(page.nextCursor).toBe(2);
  });
});

const post = (path: string, body: unknown) =>
  SELF.fetch(`http://backend${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("内部API", () => {
  it("POST /prompt-reports は外した件数と skipped を返す", async () => {
    const [first, second] = await sentenceIds();
    await reportPrompts(db, { promptIds: [second!], reason: "other", userId: "u1" });

    const res = await post("/prompt-reports", {
      promptIds: [first, second],
      reason: "unnatural",
      userId: "u1",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hidden: 1, skipped: 1 });
    expect(await countPrompts(db, "t1", "sentence")).toBe(1);
  });

  it("POST /admin/prompt-reports/restore は配信に戻す。報告中でなければ NOT_FOUND", async () => {
    const [first] = await sentenceIds();
    await reportPrompts(db, { promptIds: [first!], reason: "other", userId: "u1" });

    const ok = await post("/admin/prompt-reports/restore", { id: first });
    expect(ok.status).toBe(200);
    expect(await countPrompts(db, "t1", "sentence")).toBe(3);

    const again = await post("/admin/prompt-reports/restore", { id: first });
    expect(again.status).toBe(404);
  });

  it("POST /sessions/start は報告したお題を配らない", async () => {
    const ids = await sentenceIds();
    await reportPrompts(db, { promptIds: [ids[0]!], reason: "other", userId: "u1" });
    // 1プレイ（短文10問）に足りるよう、外したぶんを含めて積む
    await appendPrompts(
      db,
      "t1",
      "sentence",
      Array.from({ length: 10 }, (_, i) => item(`追加${i}`)),
      "model-x",
    );

    const res = await post("/sessions/start", { themeId: "t1", offset: 0 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { prompts: { id: string }[] };
    expect(body.prompts.map((p) => p.id)).not.toContain(ids[0]);
  });
});
