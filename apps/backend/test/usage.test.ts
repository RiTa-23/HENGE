import { toJstDateString } from "@henge/shared";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { getUsageCount, incrementUsage } from "../src/db/usage";
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

describe("incrementUsage（UPSERT）", () => {
  it("行が無ければ count=1 で作る", async () => {
    await seedUser("u1");
    await incrementUsage(db, "u1");

    expect(await getUsageCount(db, "u1")).toBe(1);
  });

  it("同じ日に再度加算すると count が増える（UPSERT）", async () => {
    await seedUser("u1");
    await incrementUsage(db, "u1");
    await incrementUsage(db, "u1");

    expect(await getUsageCount(db, "u1")).toBe(2);
  });

  it("前日の行は更新せず、当日の行を別に作る（JST日付で分離）", async () => {
    await seedUser("u1");
    const yesterday = toJstDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await db.insert(userGenerationUsage).values({ userId: "u1", date: yesterday, count: 49 });

    await incrementUsage(db, "u1");

    const rows = await db.select().from(userGenerationUsage);
    expect(rows).toHaveLength(2);
    // 前日は巻き戻らない（上限のリセットは日付で分離することで成り立つ）
    const yesterdayRow = rows.find((row) => row.date === yesterday);
    expect(yesterdayRow?.count).toBe(49);
    expect(await getUsageCount(db, "u1")).toBe(1);
  });

  it("ユーザーが違えば別々に数える", async () => {
    await seedUser("u1");
    await seedUser("u2");
    await incrementUsage(db, "u1");
    await incrementUsage(db, "u1");
    await incrementUsage(db, "u2");

    expect(await getUsageCount(db, "u1")).toBe(2);
    expect(await getUsageCount(db, "u2")).toBe(1);
  });
});

describe("GET /usage/:userId", () => {
  it("当日の回数を返す。行が無ければ0", async () => {
    await seedUser("u1");
    await incrementUsage(db, "u1");

    const res = await SELF.fetch("http://backend/usage/u1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
  });

  it("存在しないユーザーでもエラーにせず0を返す", async () => {
    const res = await SELF.fetch("http://backend/usage/nobody");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
  });
});
