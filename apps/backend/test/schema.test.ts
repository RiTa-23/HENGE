import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user, userGenerationUsage, userThemeProgress } from "../src/db/schema";

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
    name: "忍びの心得",
    normalizedName: "忍びの心得",
    createdBy: "u1",
  });
  await db.insert(prompts).values([
    {
      id: "p1",
      themeId: "t1",
      text: "手裏剣が闇を裂いた。",
      readingKana: "しゅりけんがやみをさいた。",
      readingRomanJson: "[]",
      keystrokeCount: 25,
      source: "workers_ai",
      sequenceNumber: 1,
    },
  ]);
  await db.insert(userThemeProgress).values({ userId: "u1", themeId: "t1", playCount: 15 });
  await db.insert(userGenerationUsage).values({ userId: "u1", date: "2026-09-04", count: 1 });
}

beforeEach(async () => {
  // vitest-pool-workers はテストごとにストレージを分離するが、明示的に空から始める
  await db.delete(prompts);
  await db.delete(userThemeProgress);
  await db.delete(userGenerationUsage);
  await db.delete(themes);
  await db.delete(user);
});

describe("CASCADE削除", () => {
  it("テーマを消すと prompts も消える", async () => {
    await seed();
    await db.delete(themes).where(eq(themes.id, "t1"));

    expect(await db.select().from(prompts)).toHaveLength(0);
  });

  it("テーマを消すと user_theme_progress も消える", async () => {
    await seed();
    await db.delete(themes).where(eq(themes.id, "t1"));

    expect(await db.select().from(userThemeProgress)).toHaveLength(0);
  });

  it("ユーザーを消すと user_theme_progress と user_generation_usage が消える", async () => {
    await seed();
    await db.delete(user).where(eq(user.id, "u1"));

    expect(await db.select().from(userThemeProgress)).toHaveLength(0);
    expect(await db.select().from(userGenerationUsage)).toHaveLength(0);
  });

  it("ユーザーを消してもテーマは残り、created_by だけNULLになる", async () => {
    await seed();
    await db.delete(user).where(eq(user.id, "u1"));

    const rows = await db.select().from(themes);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdBy).toBeNull();
  });

  it("外部キー制約が有効になっている（存在しないテーマのお題は入らない）", async () => {
    // これが通ってしまうと、上のCASCADEのテストも意味を失う
    await expect(
      db.insert(prompts).values({
        id: "p-orphan",
        themeId: "存在しないテーマ",
        text: "あ",
        readingKana: "あ",
        readingRomanJson: "[]",
        keystrokeCount: 10,
        source: "workers_ai",
        sequenceNumber: 1,
      }),
    ).rejects.toThrow();
  });
});

describe("一意制約", () => {
  it("テーマ名「ざ」と含む文字「ざ」は共存できる", async () => {
    await db.insert(themes).values([
      { id: "t-theme", kind: "theme", name: "ざ", normalizedName: "ざ" },
      { id: "t-constraint", kind: "constraint", name: "ざ", normalizedName: "ざ" },
    ]);

    expect(await db.select().from(themes)).toHaveLength(2);
  });

  it("同じ kind で同じ normalized_name は入らない", async () => {
    await db.insert(themes).values({ id: "t1", kind: "theme", name: "忍", normalizedName: "忍" });

    await expect(
      db.insert(themes).values({ id: "t2", kind: "theme", name: "忍 ", normalizedName: "忍" }),
    ).rejects.toThrow();
  });

  it("同じテーマ内で sequence_number は重複できない", async () => {
    await db.insert(themes).values({ id: "t1", kind: "theme", name: "忍", normalizedName: "忍" });
    const base = {
      themeId: "t1",
      text: "あ",
      readingKana: "あ",
      readingRomanJson: "[]",
      keystrokeCount: 10,
      source: "workers_ai" as const,
      sequenceNumber: 1,
    };
    await db.insert(prompts).values({ ...base, id: "p1" });

    await expect(db.insert(prompts).values({ ...base, id: "p2" })).rejects.toThrow();
  });
});
