import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user, userGenerationUsage } from "../src/db/schema";
import { getUsage } from "../src/db/usage";
import { themeIdKey, themeLockKey } from "../src/kv/keys";
import { DEFAULT_MODEL, neuronsUsed } from "../src/generation/model";

const db = createDb(env.DB);

/** 応答に載るトークン数と、そこから決まる1ラウンドあたりの消費 */
const TOKENS = { prompt_tokens: 1_000, completion_tokens: 1_000 };
const PER_ROUND = neuronsUsed(DEFAULT_MODEL, TOKENS);

/** AIの応答と読み取得を差し替える。外部APIは呼ばない */
function stubGeneration(lines: string[][], reading = "しのび") {
  let call = 0;
  vi.spyOn(env.AI, "run").mockImplementation(async () => ({
    response: (lines[call++] ?? []).join("\n"),
    usage: TOKENS,
  }));
  vi.spyOn(env.AI, "gateway").mockReturnValue({
    patchLog: async () => {},
  } as unknown as ReturnType<typeof env.AI.gateway>);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    // Yahoo API だけを差し替える。Worker自身への fetch は素通しする
    if (!url.includes("yahooapis")) return realFetch(input as RequestInfo);
    return Response.json({
      result: { word: [{ surface: "しのび", furigana: reading }] },
    });
  });
}

/**
 * 1ラウンドで15問揃う有効な応答。
 *
 * テキストはすべてユニークにするだけでなく、**書き出しも散らす**。
 * 同じ書き出しは2本までしか採らない（batch.ts の OPENING_MAX）ため、
 * 全部を同じ語で始めると15問に届かず GENERATION_FAILED になる。
 */
function stubValidGeneration() {
  const nums = [
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
    "十",
    "十一",
    "十二",
    "十三",
    "十四",
    "十五",
    "十六",
    "十七",
    "十八",
    "十九",
    "二十",
  ];
  stubGeneration([nums.map((n) => `${n}の忍びが闇を走る。`)], "しのびはやみをはしる。");
}

const realFetch = globalThis.fetch.bind(globalThis);

async function post(path: string, body: unknown) {
  const res = await SELF.fetch(`http://backend${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

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
  vi.restoreAllMocks();
  await db.delete(prompts);
  await db.delete(userGenerationUsage);
  await db.delete(themes);
  await db.delete(user);
  await env.KV.delete(themeIdKey("theme", "忍びの心得"));
  await env.KV.delete(themeLockKey("t1", "sentence"));
});

describe("POST /themes", () => {
  it("既存と一致したらエラーにせず既存を返す（クォータも消費しない）", async () => {
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });

    const { status, body } = await post("/themes", {
      kind: "theme",
      name: "忍びの心得",
      userId: "u1",
    });

    expect(status).toBe(200);
    expect(body.created).toBe(false);
    expect((body.theme as { id: string }).id).toBe("t1");
  });

  it("表記が違っても正規化して既存に当てる", async () => {
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "Ninja 道",
      normalizedName: "ninja 道",
    });

    const { body } = await post("/themes", {
      kind: "theme",
      name: " Ｎｉｎｊａ  道 ",
      userId: "u1",
    });
    expect(body.created).toBe(false);
  });

  it("目標に届かなければ GENERATION_FAILED を返し、テーマ行を作らない", async () => {
    // 打鍵数が足りない文しか返さないので全部却下される
    await seedUser("u1");
    stubGeneration([["あ"], ["あ"]]);

    const { status, body } = await post("/themes", {
      kind: "theme",
      name: "忍びの心得",
      userId: "u1",
    });

    expect(status).toBe(422);
    expect((body.error as { code: string }).code).toBe("GENERATION_FAILED");
    // お題ゼロのテーマが公開一覧に残らないこと
    expect(await db.select().from(themes)).toHaveLength(0);
  });

  it("失敗したテーマIDをKVにキャッシュしない", async () => {
    await seedUser("u1");
    stubGeneration([["あ"], ["あ"]]);
    await post("/themes", { kind: "theme", name: "忍びの心得", userId: "u1" });

    expect(await env.KV.get(themeIdKey("theme", "忍びの心得"))).toBeNull();
  });
});

describe("Workers AI 側の事情は、テーマ名の問題と区別して返す", () => {
  /** アカウント全体の枠切れ。**名前を変えても打ち直しても直らない** */
  it("枠切れ(3036)なら AI_QUOTA_EXCEEDED を返し、テーマを作らない", async () => {
    await seedUser("u1");
    vi.spyOn(env.AI, "run").mockRejectedValue(
      Object.assign(new Error("daily free allocation"), { code: 3036 }),
    );

    const { status, body } = await post("/themes", {
      kind: "theme",
      name: "忍びの心得",
      userId: "u1",
    });

    expect(status).toBe(429);
    expect((body.error as { code: string }).code).toBe("AI_QUOTA_EXCEEDED");
    expect(await db.select().from(themes)).toHaveLength(0);
    // 応答が返っていないので消費もしていない
    expect(await getUsage(db, "u1")).toEqual({ count: 0, neurons: 0 });
  });

  it("一時的な混雑(3040)なら AI_UNAVAILABLE を返す", async () => {
    await seedUser("u1");
    vi.spyOn(env.AI, "run").mockRejectedValue(
      Object.assign(new Error("out of capacity"), { code: 3040 }),
    );

    const { status, body } = await post("/themes", {
      kind: "theme",
      name: "忍びの心得",
      userId: "u1",
    });

    expect(status).toBe(503);
    expect((body.error as { code: string }).code).toBe("AI_UNAVAILABLE");
  });

  it("再生成でも同じコードを返し、ロックは解放する", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    vi.spyOn(env.AI, "run").mockRejectedValue(
      Object.assign(new Error("daily free allocation"), { code: 3036 }),
    );

    const { status, body } = await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(status).toBe(429);
    expect((body.error as { code: string }).code).toBe("AI_QUOTA_EXCEEDED");
    expect(await env.KV.get(themeLockKey("t1", "sentence"))).toBeNull();
  });
});

describe("同期生成の消費記録（成否によらず実消費を加算する）", () => {
  it("POST /themes で生成に成功したら、その回の消費を加算する", async () => {
    await seedUser("u1");
    stubValidGeneration();

    const { status, body } = await post("/themes", {
      kind: "theme",
      name: "忍びの心得",
      userId: "u1",
    });

    expect(status).toBe(200);
    expect(body.created).toBe(true);
    // 応答にもその回の消費を載せる（Next.js が残数の計算に使う）
    expect(body.neuronsUsed).toBeCloseTo(PER_ROUND);
    const usage = await getUsage(db, "u1");
    expect(usage.count).toBe(1);
    expect(usage.neurons).toBeCloseTo(PER_ROUND);
  });

  /**
   * **回数制との一番の違い。** 作れないテーマ名は2ラウンド回して0件で終わるが、
   * ニューロンはその2回分を消費している。ここを無料にすると、最も高い呼び出しだけが
   * 台帳から漏れる。
   */
  it("POST /themes で生成に失敗しても、2ラウンド分の消費を加算する", async () => {
    await seedUser("u1");
    stubGeneration([["あ"], ["あ"]]);

    const { status } = await post("/themes", {
      kind: "theme",
      name: "忍びの心得",
      userId: "u1",
    });

    expect(status).toBe(422);
    expect((await getUsage(db, "u1")).neurons).toBeCloseTo(PER_ROUND * 2);
  });

  it("既存テーマの再利用では消費しない（AIを呼んでいない）", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });

    const { body } = await post("/themes", { kind: "theme", name: "忍びの心得", userId: "u1" });

    expect(body.created).toBe(false);
    expect(await getUsage(db, "u1")).toEqual({ count: 0, neurons: 0 });
  });

  it("POST /prompts/regenerate で生成に成功したら、その回の消費を加算する", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    stubValidGeneration();

    const { status, body } = await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(status).toBe(200);
    expect(
      (body.theme as { promptCounts: { sentence: number } }).promptCounts.sentence,
    ).toBeGreaterThanOrEqual(15);
    expect(body.neuronsUsed).toBeCloseTo(PER_ROUND);
    expect((await getUsage(db, "u1")).neurons).toBeCloseTo(PER_ROUND);
  });

  it("POST /prompts/regenerate でロックが取れなければ消費しない", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    await env.KV.put(themeLockKey("t1", "sentence"), "1", { expirationTtl: 60 });

    await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(await getUsage(db, "u1")).toEqual({ count: 0, neurons: 0 });
  });

  it("POST /prompts/regenerate で生成に失敗しても消費を加算する", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    stubGeneration([["あ"], ["あ"]]);

    await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect((await getUsage(db, "u1")).neurons).toBeCloseTo(PER_ROUND * 2);
  });
});

describe("POST /prompts/regenerate", () => {
  it("ロックが取れなければ GENERATION_IN_PROGRESS（クォータを消費しない）", async () => {
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    await env.KV.put(themeLockKey("t1", "sentence"), "1", { expirationTtl: 60 });

    const { status, body } = await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(status).toBe(409);
    expect((body.error as { code: string }).code).toBe("GENERATION_IN_PROGRESS");
  });

  it("失敗してもロックを解放する", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    stubGeneration([["あ"], ["あ"]]);

    await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(await env.KV.get(themeLockKey("t1", "sentence"))).toBeNull();
  });

  it("存在しないテーマは NOT_FOUND を返す", async () => {
    const { status } = await post("/prompts/regenerate", { themeId: "none", userId: "u1" });
    expect(status).toBe(404);
  });

  /**
   * **単語だけ挙動が違う。** 目標は1プレイ分の30語なのに、1回で作れるのは最大
   * 40件しかない。短文と同じ「未達なら1件も保存しない」にすると、有効な語と
   * 消費したニューロンを捨てて何度も押させることになる。
   */
  it("単語は目標に届かなくても、取れた分を保存する", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    stubGeneration([["忍者", "手裏剣", "城"]], "しのび");

    const { status, body } = await post("/prompts/regenerate", {
      themeId: "t1",
      userId: "u1",
      form: "word",
    });

    expect(status).toBe(200);
    expect(body.added).toBe(3);
    expect(await db.select().from(prompts).where(eq(prompts.form, "word"))).toHaveLength(3);
  });

  it("短文はこれまでどおり、目標未達なら1件も保存しない", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    stubGeneration([["一の忍びが闇を走る。"]], "しのびはやみをはしる。");

    const { status, body } = await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(status).toBe(422);
    expect((body.error as { code: string }).code).toBe("GENERATION_FAILED");
    expect(await db.select().from(prompts)).toHaveLength(0);
  });

  it("長文も目標に届かなくても取れた分を保存し、1本も作れなければ失敗にする", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    // 1文≒21打 × 14 ≒ 294打。応答は空行区切りで2本（目標は1本）
    const body = "忍びは闇を走る。".repeat(14);
    stubGeneration(
      [[`${body}\n\n${"影は森を駆ける。".repeat(14)}`]],
      "しのびはやみをはしる。".repeat(14),
    );

    const ok = await post("/prompts/regenerate", { themeId: "t1", userId: "u1", form: "long" });
    expect(ok.status).toBe(200);
    expect(ok.body.added).toBe(2);
    expect(await db.select().from(prompts).where(eq(prompts.form, "long"))).toHaveLength(2);

    // 句点の無い一続き → punct で全滅 → 失敗
    stubGeneration([["忍びは闇を走る".repeat(14)]], "しのびはやみをはしる".repeat(14));
    const failed = await post("/prompts/regenerate", { themeId: "t1", userId: "u1", form: "long" });
    expect(failed.status).toBe(422);
    expect((failed.body.error as { code: string }).code).toBe("GENERATION_FAILED");
  });

  it("最適化練習（含む文字）に単語・長文は作れない", async () => {
    await seedUser("u1");
    await db
      .insert(themes)
      .values({ id: "c1", kind: "constraint", name: "ざ", normalizedName: "ざ" });
    stubValidGeneration();

    const results = await Promise.all(
      (["word", "long"] as const).map((form) =>
        post("/prompts/regenerate", { themeId: "c1", userId: "u1", form }),
      ),
    );
    for (const { status, body } of results) {
      expect(status).toBe(400);
      expect((body.error as { code: string }).code).toBe("VALIDATION_ERROR");
    }
    // AI を呼んでいない（クォータを消費しない）
    expect(env.AI.run).not.toHaveBeenCalled();
    expect(await db.select().from(prompts)).toHaveLength(0);
  });

  it("単語も1件も作れなければ失敗として返す", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    // ひらがなだけの語は却下される
    stubGeneration([["にんじゃ"]], "しのび");

    const { status, body } = await post("/prompts/regenerate", {
      themeId: "t1",
      userId: "u1",
      form: "word",
    });

    expect((body.error as { code: string }).code).toBe("GENERATION_FAILED");
    expect(status).toBe(422);
  });
});
