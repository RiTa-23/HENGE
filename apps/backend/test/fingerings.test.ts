/* oxlint-disable no-await-in-loop -- 投稿は順に入れないと上限の数え方を確かめられない */
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { FINGERING_POSTS_PER_USER } from "../src/db/fingerings";
import { fingeringPicks, fingeringPosts, themes, user } from "../src/db/schema";

const db = createDb(env.DB);

/** 「き」の運指。`i` の指だけ変えて、別々の運指を作る */
function ki(iFinger = "right-ring") {
  return { units: [{ roman: "ki", fingers: ["right-index", iFinger] }] };
}

async function seedUser(id: string, displayName: string | null = id) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: false,
    displayName,
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

function post(userId: string, fingering: unknown, note: string | null = null, themeId = "c1") {
  return call("POST", "/fingerings", { themeId, userId, fingering, note });
}

async function list(themeId = "c1") {
  return (await call("GET", `/fingerings?themeId=${themeId}`)).body.posts as {
    id: string;
    userId: string;
    displayName: string | null;
    fingering: unknown;
    note: string | null;
    pickCount: number;
  }[];
}

beforeEach(async () => {
  await db.delete(fingeringPicks);
  await db.delete(fingeringPosts);
  await db.delete(themes);
  await db.delete(user);
  await db.insert(themes).values([
    { id: "c1", kind: "constraint", name: "き", normalizedName: "き" },
    { id: "t1", kind: "theme", name: "忍び", normalizedName: "忍び" },
  ]);
  await seedUser("u1", "しのび");
  await seedUser("u2", "くのいち");
});

describe("運指の投稿", () => {
  it("投稿したものが一覧に出る（投稿者の表示名と説明文つき）", async () => {
    const { status } = await post("u1", ki(), "人差し指で k を取る");
    expect(status).toBe(200);

    const [only] = await list();
    expect(only).toMatchObject({
      userId: "u1",
      displayName: "しのび",
      fingering: ki(),
      note: "人差し指で k を取る",
      pickCount: 0,
    });
  });

  it("同じ運指は、別の人でも投稿できない", async () => {
    await post("u1", ki());
    const { status, body } = await post("u2", ki());

    expect(status).toBe(400);
    expect((body.error as { message: string }).message).toContain("同じ運指が既に投稿されています");
    expect(await list()).toHaveLength(1);
  });

  it(`1人1つの最適化につき${FINGERING_POSTS_PER_USER}件まで`, async () => {
    const fingers = ["right-ring", "right-pinky", "right-index", "left-middle", "left-ring"];
    for (const f of fingers) expect((await post("u1", ki(f))).status).toBe(200);

    const { status, body } = await post("u1", ki("left-pinky"));
    expect(status).toBe(400);
    expect((body.error as { message: string }).message).toContain("5つまで");
    // 別の人は投稿できる
    expect((await post("u2", ki("left-pinky"))).status).toBe(200);
  });

  it("テーマ（kind: theme）や存在しない最適化には投稿できない", async () => {
    expect((await post("u1", ki(), null, "t1")).status).toBe(404);
    expect((await post("u1", ki(), null, "none")).status).toBe(404);
  });
});

describe("投稿を選ぶ（選んだ人数の多い順）", () => {
  it("選んだ人数の多い順に並ぶ。選び直すと票が移る（1人1票）", async () => {
    await post("u1", ki("right-ring"));
    await post("u1", ki("right-pinky"));
    const [first, second] = await list();
    // 同数（0人）なら新しい順
    expect(first?.fingering).toEqual(ki("right-pinky"));

    await call("PUT", "/fingerings/picks", { userId: "u1", postId: second?.id });
    await call("PUT", "/fingerings/picks", { userId: "u2", postId: second?.id });
    let posts = await list();
    expect(posts[0]?.fingering).toEqual(ki("right-ring"));
    expect(posts[0]?.pickCount).toBe(2);

    // u2 が選び直すと、票が移る
    await call("PUT", "/fingerings/picks", { userId: "u2", postId: first?.id });
    posts = await list();
    expect(posts.map((p) => p.pickCount)).toEqual([1, 1]);
  });

  it("同じ秒に作った投稿も、後に作った方を先に出す（並びを毎回同じにする）", async () => {
    // created_at は秒単位なので、続けて投稿すると同じ値になる。ID（UUID）の並びと
    // 作った順が逆になる組で、作成時刻の同点が ID 順に流れないことを確かめる
    const createdAt = 1_700_000_000;
    for (const [id, finger] of [
      ["p-a", "right-ring"],
      ["p-z", "right-pinky"],
    ] as const) {
      await db.insert(fingeringPosts).values({
        id,
        themeId: "c1",
        userId: "u1",
        fingeringJson: JSON.stringify(ki(finger)),
        createdAt,
      });
    }

    expect((await list()).map((p) => p.id)).toEqual(["p-z", "p-a"]);
  });

  it("無い投稿は NOT_FOUND", async () => {
    expect((await call("PUT", "/fingerings/picks", { userId: "u1", postId: "none" })).status).toBe(
      404,
    );
  });
});

describe("投稿を消す", () => {
  it("1件の取得で持ち主を返し、消すと選んだ人の行も消える", async () => {
    await post("u1", ki());
    const [only] = await list();
    await call("PUT", "/fingerings/picks", { userId: "u2", postId: only?.id });

    const got = await call("GET", `/fingerings/${only?.id}`);
    expect(got.body.post).toEqual({ id: only?.id, themeId: "c1", userId: "u1" });

    await call("DELETE", `/fingerings/${only?.id}`);
    expect(await list()).toHaveLength(0);
    expect(await db.select().from(fingeringPicks)).toHaveLength(0);
  });

  // D1 の CASCADE。最適化を消したら投稿も消える（KV には投稿を置いていない）
  it("最適化を消すと投稿も消える", async () => {
    await post("u1", ki());
    await db.delete(themes);
    expect(await db.select().from(fingeringPosts)).toHaveLength(0);
  });
});
