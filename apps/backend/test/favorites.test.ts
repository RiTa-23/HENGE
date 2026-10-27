import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { favorites, themes, user } from "../src/db/schema";

const db = createDb(env.DB);

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

async function call(method: string, path: string, body?: unknown) {
  const res = await SELF.fetch(`http://backend${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const add = (userId: string, themeId: string) => call("PUT", "/favorites", { userId, themeId });
const remove = (userId: string, themeId: string) =>
  call("DELETE", "/favorites", { userId, themeId });

async function list(userId: string) {
  const { body } = await call("GET", `/favorites?userId=${userId}`);
  return (body.themes as { id: string; kind: string; name: string }[]).map((t) => t.id);
}

async function status(userId: string, themeId: string) {
  return (await call("GET", `/favorites/status?userId=${userId}&themeId=${themeId}`)).body
    .favorited;
}

beforeEach(async () => {
  await db.delete(favorites);
  await db.delete(themes);
  await db.delete(user);
  await db.insert(themes).values([
    { id: "t1", kind: "theme", name: "忍び", normalizedName: "忍び" },
    { id: "c1", kind: "constraint", name: "き", normalizedName: "き" },
    { id: "m1", kind: "mix", name: "おまかせ", normalizedName: "おまかせ" },
  ]);
  await seedUser("u1");
  await seedUser("u2");
});

describe("お気に入り", () => {
  it("テーマと最適化を登録でき、本人の一覧にだけ出る", async () => {
    expect((await add("u1", "t1")).status).toBe(200);
    expect((await add("u1", "c1")).status).toBe(200);

    expect(new Set(await list("u1"))).toEqual(new Set(["t1", "c1"]));
    expect(await list("u2")).toEqual([]);
    expect(await status("u1", "t1")).toBe(true);
    expect(await status("u2", "t1")).toBe(false);
  });

  it("登録の新しい順に並ぶ（テーマの作成順ではない）", async () => {
    await db.insert(favorites).values([
      { userId: "u1", themeId: "t1", createdAt: 100 },
      { userId: "u1", themeId: "c1", createdAt: 200 },
    ]);
    expect(await list("u1")).toEqual(["c1", "t1"]);
  });

  it("2回登録しても1行のまま、日時も変わらない", async () => {
    await db.insert(favorites).values({ userId: "u1", themeId: "t1", createdAt: 100 });
    expect((await add("u1", "t1")).status).toBe(200);

    const rows = await db.select().from(favorites);
    expect(rows).toEqual([{ userId: "u1", themeId: "t1", createdAt: 100 }]);
  });

  it("外すと一覧から消える。登録していなくても外せる", async () => {
    await add("u1", "t1");
    expect((await remove("u1", "t1")).status).toBe(200);
    expect(await list("u1")).toEqual([]);
    expect((await remove("u1", "t1")).status).toBe(200);
  });

  it("他人のお気に入りは外れない（userId で絞っている）", async () => {
    await add("u1", "t1");
    await remove("u2", "t1");
    expect(await list("u1")).toEqual(["t1"]);
  });

  it("存在しないテーマ・おまかせ（mix）は NOT_FOUND", async () => {
    expect((await add("u1", "nope")).status).toBe(404);
    expect((await add("u1", "m1")).status).toBe(404);
    expect(await list("u1")).toEqual([]);
  });

  it("テーマを消すとお気に入りも消える（CASCADE）", async () => {
    await add("u1", "t1");
    await env.DB.prepare("DELETE FROM themes WHERE id = 't1'").run();
    expect(await db.select().from(favorites)).toEqual([]);
  });

  it("ユーザーを消すとお気に入りも消える（CASCADE）", async () => {
    await add("u1", "t1");
    await env.DB.prepare("DELETE FROM user WHERE id = 'u1'").run();
    expect(await db.select().from(favorites)).toEqual([]);
  });
});
