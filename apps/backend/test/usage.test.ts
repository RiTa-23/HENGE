import { usageDateKey } from "@henge/shared";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { addUsage, getUsage } from "../src/db/usage";
import { user, userGenerationUsage } from "../src/db/schema";

const db = createDb(env.DB);

async function seedUser(id: string) {
  await db.insert(user).values({
    id,
    name: "忍",
    email: `${id}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

beforeEach(async () => {
  await db.delete(userGenerationUsage);
  await db.delete(user);
});

describe("addUsage（UPSERT）", () => {
  it("行が無ければ count=1・実消費で作る", async () => {
    await seedUser("u1");
    await addUsage(db, "u1", 12.5);

    expect(await getUsage(db, "u1")).toEqual({ count: 1, neurons: 12.5 });
  });

  it("同じ日に再度加算すると両方が積み上がる（小数のまま）", async () => {
    await seedUser("u1");
    await addUsage(db, "u1", 12.5);
    await addUsage(db, "u1", 7.25);

    const usage = await getUsage(db, "u1");
    expect(usage.count).toBe(2);
    expect(usage.neurons).toBeCloseTo(19.75);
  });

  it("前日の行は更新せず、当日の行を別に作る（JST日付で分離）", async () => {
    await seedUser("u1");
    const yesterday = usageDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await db
      .insert(userGenerationUsage)
      .values({ userId: "u1", date: yesterday, count: 20, neurons: 490 });

    await addUsage(db, "u1", 10);

    const rows = await db.select().from(userGenerationUsage);
    expect(rows).toHaveLength(2);
    // 前日は巻き戻らない（上限のリセットは日付で分離することで成り立つ）
    const yesterdayRow = rows.find((row) => row.date === yesterday);
    expect(yesterdayRow?.neurons).toBe(490);
    expect(await getUsage(db, "u1")).toEqual({ count: 1, neurons: 10 });
  });

  it("ユーザーが違えば別々に数える", async () => {
    await seedUser("u1");
    await seedUser("u2");
    await addUsage(db, "u1", 10);
    await addUsage(db, "u1", 10);
    await addUsage(db, "u2", 3);

    expect((await getUsage(db, "u1")).neurons).toBeCloseTo(20);
    expect((await getUsage(db, "u2")).neurons).toBeCloseTo(3);
  });
});

describe("GET /usage/:userId", () => {
  it("当日の回数と消費ニューロンを返す", async () => {
    await seedUser("u1");
    await addUsage(db, "u1", 8.5);

    const res = await SELF.fetch("http://backend/usage/u1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1, neurons: 8.5 });
  });

  it("存在しないユーザーでもエラーにせず0を返す", async () => {
    const res = await SELF.fetch("http://backend/usage/nobody");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0, neurons: 0 });
  });
});
