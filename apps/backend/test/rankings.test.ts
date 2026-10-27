/* oxlint-disable no-await-in-loop -- テストデータの投入は順に入れた方が読みやすい */
import { RANKING_SIZE } from "@henge/shared";
import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, rankings, themes, user } from "../src/db/schema";
import { rankingTicketKey } from "../src/kv/keys";

const db = createDb(env.DB);

async function seedUser(id: string, displayName: string | null = id) {
  await db.insert(user).values({
    id,
    name: `google-${id}`,
    email: `${id}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    displayName,
  });
}

async function seedTheme(id: string) {
  await db.insert(themes).values({ id, kind: "theme", name: id, normalizedName: id });
}

/** 60秒・ミス0で hits 打鍵 → スコアは hits と同じ値になる（WPM = hits、正確率 1） */
function statsOf(hits: number, misses = 0) {
  return { hits, misses, elapsedMs: 60_000 };
}

/**
 * u1 を含めて RANKING_SIZE 人で板を埋める（u{i} のスコアは 1000 + i。u1 が最下位）。
 * 100回 POST すると遅いので、行を直接入れる。**D1 のバインド変数は1文100個まで**
 * なので、列数に合わせて小分けにする（docs/03-data-model.md）。
 */
async function fillBoard() {
  const ids = Array.from({ length: RANKING_SIZE - 1 }, (_, i) => `u${i + 2}`);
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    await db.insert(user).values(
      chunk.map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        displayName: id,
      })),
    );
  }
  const all = ["u1", ...ids];
  for (let i = 0; i < all.length; i += 10) {
    await db.insert(rankings).values(
      all.slice(i, i + 10).map((userId) => {
        const n = Number(userId.slice(1));
        return {
          themeId: "t1",
          form: "sentence" as const,
          userId,
          score: 1000 + n,
          hits: 1000 + n,
          misses: 0,
          elapsedMs: 60_000,
          createdAt: n,
        };
      }),
    );
  }
}

let ticketSeq = 0;

/**
 * 登録。**チケットの印は呼ぶたびに新しくする**（使い捨てなので、同じ印だと2回目が弾かれる）。
 * 使い回しを確かめるときだけ `ticketId` を渡す
 */
async function post(body: Record<string, unknown>) {
  ticketSeq += 1;
  const res = await SELF.fetch("http://backend/rankings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketId: `j${ticketSeq}`, ticketTtlSeconds: 7200, ...body }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function list(themeId: string, form = "sentence") {
  const res = await SELF.fetch(`http://backend/rankings?themeId=${themeId}&form=${form}`);
  return ((await res.json()) as { entries: Record<string, unknown>[] }).entries;
}

beforeEach(async () => {
  await db.delete(rankings);
  await db.delete(prompts);
  await db.delete(themes);
  await db.delete(user);
  await seedTheme("t1");
  await seedUser("u1", "影丸");
});

describe("POST /rankings", () => {
  it("初回は登録され、スコアはサーバーで計算した値になる", async () => {
    const { status, body } = await post({
      userId: "u1",
      themeId: "t1",
      form: "sentence",
      stats: statsOf(300, 100),
    });

    expect(status).toBe(200);
    // WPM 400 × (300/400)^3 = 168.75 → 168
    expect(body).toEqual({ score: 168, best: true, rank: 1 });
  });

  it("ベストより低いスコアでは書き換えず、既存の順位を返す", async () => {
    await post({ userId: "u1", themeId: "t1", form: "sentence", stats: statsOf(300) });

    const { body } = await post({
      userId: "u1",
      themeId: "t1",
      form: "sentence",
      stats: statsOf(200),
    });

    expect(body).toEqual({ score: 200, best: false, rank: 1 });
    expect((await list("t1"))[0]?.score).toBe(300);
  });

  it("ベストを更新すると書き換わる（1人1件）", async () => {
    await post({ userId: "u1", themeId: "t1", form: "sentence", stats: statsOf(200) });
    await post({ userId: "u1", themeId: "t1", form: "sentence", stats: statsOf(300) });

    const entries = await list("t1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.score).toBe(300);
  });

  it("短文と単語は別のランキング", async () => {
    await post({ userId: "u1", themeId: "t1", form: "sentence", stats: statsOf(300) });
    await post({ userId: "u1", themeId: "t1", form: "word", stats: statsOf(200) });

    expect((await list("t1", "sentence"))[0]?.score).toBe(300);
    expect((await list("t1", "word"))[0]?.score).toBe(200);
  });

  it("テーマが無ければ NOT_FOUND", async () => {
    const { status, body } = await post({
      userId: "u1",
      themeId: "nope",
      form: "sentence",
      stats: statsOf(300),
    });
    expect(status).toBe(404);
    expect((body.error as { code: string }).code).toBe("NOT_FOUND");
  });

  it("同じチケットでは2回登録できない（使い捨て）", async () => {
    const body = { userId: "u1", themeId: "t1", form: "sentence", stats: statsOf(300) };
    expect((await post({ ...body, ticketId: "same" })).status).toBe(200);

    const { status, body: second } = await post({ ...body, ticketId: "same", stats: statsOf(500) });

    expect(status).toBe(403);
    expect((second.error as { code: string }).code).toBe("FORBIDDEN");
    expect((await list("t1"))[0]?.score).toBe(300);
    expect(await env.KV.get(rankingTicketKey("same"))).not.toBeNull();
  });

  it("テーマが無ければチケットを使ったことにしない", async () => {
    await post({
      userId: "u1",
      themeId: "nope",
      form: "sentence",
      stats: statsOf(300),
      ticketId: "unused",
    });
    expect(await env.KV.get(rankingTicketKey("unused"))).toBeNull();
  });

  it("101位以下は消え、順位は null で返る", async () => {
    await fillBoard();
    await seedUser("late");

    const { body } = await post({
      userId: "late",
      themeId: "t1",
      form: "sentence",
      stats: statsOf(500),
    });

    expect(body).toEqual({ score: 500, best: true, rank: null });
    const rows = await db.select().from(rankings).where(eq(rankings.userId, "late"));
    expect(rows).toEqual([]);
    expect(await list("t1")).toHaveLength(RANKING_SIZE);
  });

  it("上位に割り込むと最下位が押し出される", async () => {
    await fillBoard();
    await seedUser("late");

    const { body } = await post({
      userId: "late",
      themeId: "t1",
      form: "sentence",
      stats: statsOf(5000),
    });

    expect(body).toEqual({ score: 5000, best: true, rank: 1 });
    const entries = await list("t1");
    expect(entries).toHaveLength(RANKING_SIZE);
    // 最下位だった u1（1001）が消えている
    expect(entries.some((entry) => entry.userId === "u1")).toBe(false);
  });
});

describe("POST /rankings/prompts", () => {
  it("IDで引いた読みを返す。無いIDは返らない", async () => {
    await db.insert(prompts).values({
      id: "p1",
      themeId: "t1",
      form: "word",
      text: "猫",
      readingKana: "ねこ",
      readingRomanJson: '[["ne"],["ko","co"]]',
      keystrokeCount: 4,
      source: "workers_ai",
      sequenceNumber: 1,
    });

    const res = await SELF.fetch("http://backend/rankings/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["p1", "gone"] }),
    });

    expect(await res.json()).toEqual({
      prompts: [{ id: "p1", themeId: "t1", form: "word", readingRoman: [["ne"], ["ko", "co"]] }],
    });
  });
});

describe("GET /rankings", () => {
  it("スコアの降順、同点は先に出した方が上。名前は user.display_name を結合する", async () => {
    await seedUser("u2", "半蔵");
    await db.insert(rankings).values([
      {
        themeId: "t1",
        form: "sentence",
        userId: "u1",
        score: 300,
        hits: 300,
        misses: 0,
        elapsedMs: 60_000,
        createdAt: 200,
      },
      {
        themeId: "t1",
        form: "sentence",
        userId: "u2",
        score: 300,
        hits: 300,
        misses: 0,
        elapsedMs: 60_000,
        createdAt: 100,
      },
    ]);

    const entries = await list("t1");

    expect(entries.map((entry) => [entry.rank, entry.displayName])).toEqual([
      [1, "半蔵"],
      [2, "影丸"],
    ]);
  });

  it("記録が無ければ空", async () => {
    expect(await list("t1")).toEqual([]);
  });
});

describe("CASCADE", () => {
  it("テーマを消すと記録も消える", async () => {
    await post({ userId: "u1", themeId: "t1", form: "sentence", stats: statsOf(300) });
    await db.delete(themes).where(eq(themes.id, "t1"));
    expect(await db.select().from(rankings)).toEqual([]);
  });

  it("ユーザーを消すと記録も消える", async () => {
    await post({ userId: "u1", themeId: "t1", form: "sentence", stats: statsOf(300) });
    await db.delete(user).where(eq(user.id, "u1"));
    expect(await db.select().from(rankings)).toEqual([]);
  });
});
