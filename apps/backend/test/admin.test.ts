/* oxlint-disable no-await-in-loop -- テストデータの投入は件数が少なく、順に入れた方が読みやすい */
import { toJstDateString } from "@henge/shared";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user, userGenerationUsage, userThemeProgress } from "../src/db/schema";
import { themeIdKey, themeLockKey } from "../src/kv/keys";

const db = createDb(env.DB);

async function seedUser(id: string, createdAt: Date) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: false,
    createdAt,
    updatedAt: createdAt,
  });
}

async function seedTheme(over: Partial<typeof themes.$inferInsert> & { id: string }) {
  await db.insert(themes).values({
    kind: "theme",
    name: over.id,
    normalizedName: over.id,
    ...over,
  });
}

async function request(path: string, init?: RequestInit) {
  const res = await SELF.fetch(`http://backend${path}`, init);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(async () => {
  await db.delete(prompts);
  await db.delete(userThemeProgress);
  await db.delete(userGenerationUsage);
  await db.delete(themes);
  await db.delete(user);
});

describe("GET /admin/themes", () => {
  it("kind で絞らず、テーマと含む文字の両方を返す", async () => {
    await seedTheme({ id: "t1", kind: "theme", createdAt: 100 });
    await seedTheme({ id: "c1", kind: "constraint", createdAt: 200 });

    const { status, body } = await request("/admin/themes");

    expect(status).toBe(200);
    // 公開一覧は人気順が既定だが、管理用は作成順（新しい順）に固定する
    expect((body.themes as { id: string }[]).map((t) => t.id)).toEqual(["c1", "t1"]);
  });

  it("お題数（sequence_number の最大値）を含む", async () => {
    await seedTheme({ id: "t1" });
    await db.insert(prompts).values(
      [1, 2, 3].map((n) => ({
        id: `p${n}`,
        themeId: "t1",
        text: "手裏剣が闇を裂いた。",
        readingKana: "しゅりけんがやみをさいた。",
        readingRomanJson: "[]",
        keystrokeCount: 25,
        source: "workers_ai" as const,
        sequenceNumber: n,
      })),
    );

    const { body } = await request("/admin/themes");

    expect((body.themes as { promptCount: number }[])[0]?.promptCount).toBe(3);
  });

  it("お題が1件も無いテーマは promptCount=0 で返る（一覧から消えない）", async () => {
    await seedTheme({ id: "t1" });

    const { body } = await request("/admin/themes");

    expect((body.themes as { promptCount: number }[])[0]?.promptCount).toBe(0);
  });

  it("limit を超えると nextCursor が返る", async () => {
    for (const n of [1, 2, 3]) await seedTheme({ id: `t${n}`, createdAt: n });

    const { body } = await request("/admin/themes?limit=2");

    expect(body.themes).toHaveLength(2);
    expect(body.nextCursor).toBe(2);
  });

  it("最終ページの nextCursor は null", async () => {
    for (const n of [1, 2, 3]) await seedTheme({ id: `t${n}`, createdAt: n });

    const { body } = await request("/admin/themes?limit=2&cursor=2");

    expect(body.themes).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });
});

describe("DELETE /admin/themes/:id", () => {
  it("お題と進捗はFKのCASCADEで一緒に消える", async () => {
    await seedUser("u1", new Date());
    await seedTheme({ id: "t1" });
    await db.insert(prompts).values({
      id: "p1",
      themeId: "t1",
      text: "手裏剣が闇を裂いた。",
      readingKana: "しゅりけんがやみをさいた。",
      readingRomanJson: "[]",
      keystrokeCount: 25,
      source: "workers_ai",
      sequenceNumber: 1,
    });
    await db.insert(userThemeProgress).values({ userId: "u1", themeId: "t1", playCount: 15 });

    const { status } = await request("/admin/themes/t1", { method: "DELETE" });

    expect(status).toBe(200);
    expect(await db.select().from(themes)).toHaveLength(0);
    expect(await db.select().from(prompts)).toHaveLength(0);
    expect(await db.select().from(userThemeProgress)).toHaveLength(0);
  });

  // D1のCASCADEはD1の中でしか効かない。消し忘れると
  // 「削除したテーマがキャッシュ経由で復活したように見える」
  it("KVのテーマIDキャッシュも消える", async () => {
    await seedTheme({ id: "t1", kind: "theme", name: "忍びの心得", normalizedName: "忍びの心得" });
    await env.KV.put(themeIdKey("theme", "忍びの心得"), "t1");

    await request("/admin/themes/t1", { method: "DELETE" });

    expect(await env.KV.get(themeIdKey("theme", "忍びの心得"))).toBeNull();
  });

  it("生成ロックも消える（TTLの満了を待たない）", async () => {
    await seedTheme({ id: "t1" });
    await env.KV.put(themeLockKey("t1"), "1");

    await request("/admin/themes/t1", { method: "DELETE" });

    expect(await env.KV.get(themeLockKey("t1"))).toBeNull();
  });

  it("存在しないテーマは NOT_FOUND", async () => {
    const { status, body } = await request("/admin/themes/nothing", { method: "DELETE" });

    expect(status).toBe(404);
    expect((body.error as { code: string }).code).toBe("NOT_FOUND");
  });

  it("作成者のユーザー行は消さない（テーマを消しても退会にはしない）", async () => {
    await seedUser("u1", new Date());
    await seedTheme({ id: "t1", createdBy: "u1" });

    await request("/admin/themes/t1", { method: "DELETE" });

    expect(await db.select().from(user)).toHaveLength(1);
  });
});

describe("GET /admin/users", () => {
  it("新しい順に返す", async () => {
    await seedUser("u1", new Date(1000));
    await seedUser("u2", new Date(2000));

    const { status, body } = await request("/admin/users");

    expect(status).toBe(200);
    expect((body.users as { id: string }[]).map((u) => u.id)).toEqual(["u2", "u1"]);
  });

  it("当日（JST基準）の生成回数を併記する", async () => {
    await seedUser("u1", new Date());
    await db.insert(userGenerationUsage).values({
      userId: "u1",
      date: toJstDateString(),
      count: 3,
    });

    const { body } = await request("/admin/users");

    expect((body.users as { todayGenerationCount: number }[])[0]?.todayGenerationCount).toBe(3);
  });

  it("前日の行は当日のカウントに混ぜない", async () => {
    await seedUser("u1", new Date());
    const yesterday = toJstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await db.insert(userGenerationUsage).values({ userId: "u1", date: yesterday, count: 49 });

    const { body } = await request("/admin/users");

    expect((body.users as { todayGenerationCount: number }[])[0]?.todayGenerationCount).toBe(0);
  });

  it("limit を超えると nextCursor が返る", async () => {
    for (const n of [1, 2, 3]) await seedUser(`u${n}`, new Date(n * 1000));

    const { body } = await request("/admin/users?limit=2");

    expect(body.users).toHaveLength(2);
    expect(body.nextCursor).toBe(2);
  });
});

describe("管理用一覧の日時の形", () => {
  // themes.created_at は秒（integer）、user.created_at はミリ秒（timestamp_ms）で、
  // JSON になったときの形が違う。管理画面がどちらもパースできるよう固定する
  it("themes は秒の数値、users は ISO 文字列で返る", async () => {
    await seedTheme({ id: "t1", createdAt: 1757000000 });
    await seedUser("u1", new Date("2026-09-05T12:00:00.000Z"));

    const themeList = await request("/admin/themes");
    const userList = await request("/admin/users");

    expect((themeList.body.themes as { createdAt: unknown }[])[0]?.createdAt).toBe(1757000000);
    expect((userList.body.users as { createdAt: unknown }[])[0]?.createdAt).toBe(
      "2026-09-05T12:00:00.000Z",
    );
  });
});
