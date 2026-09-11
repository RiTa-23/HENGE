/* oxlint-disable no-await-in-loop -- テストデータの投入は件数が少なく、順に入れた方が読みやすい */
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user } from "../src/db/schema";

const db = createDb(env.DB);

async function seedTheme(over: Partial<typeof themes.$inferInsert> & { id: string }) {
  await db.insert(themes).values({
    kind: "theme",
    name: over.id,
    normalizedName: over.id,
    ...over,
  });
}

/** `created_by` の FK の親。作成者で絞るテストで使う */
async function seedUser(id: string) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function get(path: string) {
  const res = await SELF.fetch(`http://backend${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(async () => {
  await db.delete(prompts);
  await db.delete(themes);
  await db.delete(user);
});

describe("GET /themes", () => {
  it("kind で絞り込む（テーマと含む文字は同じテーブル）", async () => {
    await seedTheme({ id: "t1", kind: "theme", name: "ざ", normalizedName: "ざ" });
    await seedTheme({ id: "c1", kind: "constraint", name: "ざ", normalizedName: "ざ" });

    const themeList = await get("/themes?kind=theme");
    const constraintList = await get("/themes?kind=constraint");

    expect((themeList.body.themes as { id: string }[]).map((t) => t.id)).toEqual(["t1"]);
    expect((constraintList.body.themes as { id: string }[]).map((t) => t.id)).toEqual(["c1"]);
  });

  it("人気順は total_play_count の降順", async () => {
    await seedTheme({ id: "a", totalPlayCount: 1 });
    await seedTheme({ id: "b", totalPlayCount: 9 });

    const { body } = await get("/themes?kind=theme&sort=popular");
    expect((body.themes as { id: string }[]).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("新着順は created_at の降順", async () => {
    await seedTheme({ id: "old", createdAt: 100 });
    await seedTheme({ id: "new", createdAt: 200 });

    const { body } = await get("/themes?kind=theme&sort=recent");
    expect((body.themes as { id: string }[]).map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("limit と cursor でページングし、続きがあれば nextCursor を返す", async () => {
    for (let i = 0; i < 3; i++) await seedTheme({ id: `t${i}`, totalPlayCount: 10 - i });

    const first = await get("/themes?kind=theme&limit=2");
    expect((first.body.themes as unknown[]).length).toBe(2);
    expect(first.body.nextCursor).toBe(2);

    const second = await get("/themes?kind=theme&limit=2&cursor=2");
    expect((second.body.themes as unknown[]).length).toBe(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it("表示名で引ける。正規化はサーバー側で行う", async () => {
    await seedTheme({ id: "t1", name: "Ninja 道", normalizedName: "ninja 道" });

    // 全角・大文字・余分な空白で来ても同じテーマに当たる
    const { body } = await get(
      `/themes?kind=theme&name=${encodeURIComponent("  Ｎｉｎｊａ  道 ")}`,
    );
    expect((body.themes as { id: string }[]).map((t) => t.id)).toEqual(["t1"]);
  });

  it("表示名が見つからなければ空で返す", async () => {
    const { body } = await get("/themes?kind=theme&name=存在しない");
    expect(body.themes).toEqual([]);
  });
});

describe("GET /themes/:id", () => {
  it("在庫数を形式ごとに COUNT で返す", async () => {
    await seedTheme({ id: "t1" });
    await db.insert(prompts).values(
      [1, 2, 3].map((n) => ({
        id: `p${n}`,
        themeId: "t1",
        text: "あ",
        readingKana: "あ",
        readingRomanJson: "[]",
        keystrokeCount: 12,
        source: "workers_ai" as const,
        sequenceNumber: n,
      })),
    );

    const { body } = await get("/themes/t1");
    expect((body.theme as { promptCounts: { sentence: number } }).promptCounts.sentence).toBe(3);
  });

  it("お題が無いテーマは0件として返す", async () => {
    await seedTheme({ id: "t1" });
    const { body } = await get("/themes/t1");
    expect((body.theme as { promptCounts: { sentence: number } }).promptCounts.sentence).toBe(0);
  });

  it("存在しないテーマは NOT_FOUND を返す（入力の形式は正しいため）", async () => {
    const { status, body } = await get("/themes/none");
    expect(status).toBe(404);
    expect((body.error as { code: string }).code).toBe("NOT_FOUND");
  });
});

describe("GET /users/themes", () => {
  it("作成者で絞り、テーマと含む文字の両方を作成順（新しい順）で返す", async () => {
    await seedUser("u1");
    await seedUser("u2");
    await seedTheme({ id: "mine-old", createdBy: "u1", createdAt: 100 });
    await seedTheme({ id: "mine-new", kind: "constraint", createdBy: "u1", createdAt: 200 });
    await seedTheme({ id: "theirs", createdBy: "u2", createdAt: 300 });
    // 運営投入分（created_by が NULL）は誰の一覧にも出ない
    await seedTheme({ id: "seeded", createdBy: null, createdAt: 400 });

    const { status, body } = await get("/users/themes?userId=u1");

    expect(status).toBe(200);
    expect((body.themes as { id: string }[]).map((t) => t.id)).toEqual(["mine-new", "mine-old"]);
    expect(body.nextCursor).toBeNull();
  });

  it("limit と cursor でページングし、続きがあれば nextCursor を返す", async () => {
    await seedUser("u1");
    for (let i = 0; i < 3; i++) await seedTheme({ id: `t${i}`, createdBy: "u1", createdAt: i });

    const first = await get("/users/themes?userId=u1&limit=2");
    expect((first.body.themes as unknown[]).length).toBe(2);
    expect(first.body.nextCursor).toBe(2);

    const second = await get("/users/themes?userId=u1&limit=2&cursor=2");
    expect((second.body.themes as unknown[]).length).toBe(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it("作ったものが無ければ空で返す", async () => {
    const { body } = await get("/users/themes?userId=nobody");
    expect(body.themes).toEqual([]);
  });
});
