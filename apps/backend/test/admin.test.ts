/* oxlint-disable no-await-in-loop -- テストデータの投入は件数が少なく、順に入れた方が読みやすい */
import { buildRomanCandidates, countKeystrokes, usageDateKey } from "@henge/shared";
import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user, userGenerationUsage, userThemeProgress } from "../src/db/schema";
import { themeIdKey, themeLockKey } from "../src/kv/keys";

const db = createDb(env.DB);

const realFetch = globalThis.fetch.bind(globalThis);

/** ルビ振りAPIだけを差し替える。Worker自身への fetch は素通しする */
function stubReading(furigana: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (!url.includes("yahooapis")) return realFetch(input as RequestInfo);
    return Response.json({
      result: { word: [{ surface: "手裏剣", furigana }] },
    });
  });
}

/** お題1行を挿す */
async function seedPrompt(
  over: Partial<typeof prompts.$inferInsert> & {
    id: string;
    themeId: string;
    sequenceNumber: number;
  },
) {
  await db.insert(prompts).values({
    text: "手裏剣が闇を裂いた。",
    readingKana: "しゅりけんがやみをさいた。",
    readingRomanJson: "[]",
    keystrokeCount: 25,
    source: "workers_ai",
    ...over,
  });
}

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

  it("お題数を形式ごとに含む", async () => {
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

    expect(
      (body.themes as { promptCounts: { sentence: number } }[])[0]?.promptCounts.sentence,
    ).toBe(3);
  });

  it("お題が1件も無いテーマは0件として返る（一覧から消えない）", async () => {
    await seedTheme({ id: "t1" });

    const { body } = await request("/admin/themes");

    expect(
      (body.themes as { promptCounts: { sentence: number } }[])[0]?.promptCounts.sentence,
    ).toBe(0);
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
    await env.KV.put(themeLockKey("t1", "sentence"), "1");
    // ロックは形式ごとに別のキー。**3形式すべて**消えることを見る（不変条件6）
    await env.KV.put(themeLockKey("t1", "word"), "1");
    await env.KV.put(themeLockKey("t1", "long"), "1");

    await request("/admin/themes/t1", { method: "DELETE" });

    expect(await env.KV.get(themeLockKey("t1", "sentence"))).toBeNull();
    expect(await env.KV.get(themeLockKey("t1", "word"))).toBeNull();
    expect(await env.KV.get(themeLockKey("t1", "long"))).toBeNull();
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

  it("当日（JST基準）の消費ニューロンと回数を併記する", async () => {
    await seedUser("u1", new Date());
    await db.insert(userGenerationUsage).values({
      userId: "u1",
      date: usageDateKey(),
      count: 3,
      neurons: 19.5,
    });

    const { body } = await request("/admin/users");

    const [row] = body.users as { todayGenerationCount: number; todayNeurons: number }[];
    // 上限に張り付いているかは消費で見る。回数はその分母
    expect(row?.todayNeurons).toBeCloseTo(19.5);
    expect(row?.todayGenerationCount).toBe(3);
  });

  it("前日の行は当日の消費に混ぜない", async () => {
    await seedUser("u1", new Date());
    const yesterday = usageDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await db
      .insert(userGenerationUsage)
      .values({ userId: "u1", date: yesterday, count: 20, neurons: 480 });

    const { body } = await request("/admin/users");

    const [row] = body.users as { todayGenerationCount: number; todayNeurons: number }[];
    expect(row?.todayNeurons).toBe(0);
    expect(row?.todayGenerationCount).toBe(0);
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

describe("GET /admin/prompts", () => {
  it("連番順に、読み・打鍵数・モデル・連番を含めて返す", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 2, model: "model-x" });
    await seedPrompt({ id: "p2", themeId: "t1", sequenceNumber: 1 });

    const { status, body } = await request("/admin/prompts?themeId=t1");

    expect(status).toBe(200);
    const list = body.prompts as {
      id: string;
      text: string;
      readingKana: string;
      keystrokeCount: number;
      sequenceNumber: number;
      model: string | null;
      createdAt: number;
    }[];
    expect(list.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(list[1]).toMatchObject({
      text: "手裏剣が闇を裂いた。",
      readingKana: "しゅりけんがやみをさいた。",
      keystrokeCount: 25,
      sequenceNumber: 2,
      model: "model-x",
    });
    expect(list[1]?.createdAt).toBeTypeOf("number");
  });

  /**
   * **短文と単語はプールが別で、連番も1から振り直される。** 混ぜて出すと番号が
   * 2回りして、管理者がどの行を消せばよいか読めなくなる。
   */
  it("形式で絞る。単語を指定すると単語だけが返る", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    await seedPrompt({ id: "w1", themeId: "t1", form: "word", sequenceNumber: 1, text: "手裏剣" });
    await seedPrompt({ id: "w2", themeId: "t1", form: "word", sequenceNumber: 2, text: "忍者" });

    const words = await request("/admin/prompts?themeId=t1&form=word");
    const sentences = await request("/admin/prompts?themeId=t1&form=sentence");

    expect((words.body.prompts as { id: string }[]).map((p) => p.id)).toEqual(["w1", "w2"]);
    expect((sentences.body.prompts as { id: string }[]).map((p) => p.id)).toEqual(["p1"]);
  });

  it("形式を省略すると短文が返る", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    await seedPrompt({ id: "w1", themeId: "t1", form: "word", sequenceNumber: 1, text: "手裏剣" });

    const { body } = await request("/admin/prompts?themeId=t1");

    expect((body.prompts as { id: string }[]).map((p) => p.id)).toEqual(["p1"]);
  });

  it("違うテーマのお題は混ざらない", async () => {
    await seedTheme({ id: "t1" });
    await seedTheme({ id: "t2" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    await seedPrompt({ id: "p2", themeId: "t2", sequenceNumber: 1 });

    const { body } = await request("/admin/prompts?themeId=t1");

    expect((body.prompts as { id: string }[]).map((p) => p.id)).toEqual(["p1"]);
  });

  it("limit を超えると nextCursor が返り、最終ページは null", async () => {
    await seedTheme({ id: "t1" });
    for (const n of [1, 2, 3]) await seedPrompt({ id: `p${n}`, themeId: "t1", sequenceNumber: n });

    const page1 = await request("/admin/prompts?themeId=t1&limit=2");
    expect((page1.body.prompts as { id: string }[]).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(page1.body.nextCursor).toBe(2);

    const page2 = await request("/admin/prompts?themeId=t1&limit=2&cursor=2");
    expect((page2.body.prompts as { id: string }[]).map((p) => p.id)).toEqual(["p3"]);
    expect(page2.body.nextCursor).toBeNull();
  });
});

describe("PATCH /admin/prompts", () => {
  it("本文の差し替えに合わせて、読み・ローマ字・打鍵数も取り直す", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    const stub = stubReading("にんじゃがつきをほえる。");

    const { status, body } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", text: "忍者が月を吼える。" }),
    });

    stub.mockRestore();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: "p1",
      text: "忍者が月を吼える。",
      readingKana: "にんじゃがつきをほえる。",
    });

    // 本文だけ変わって「読みが古いまま」になっていないか。行を直接見る
    const [row] = await db.select().from(prompts).where(eq(prompts.id, "p1"));
    const roman = buildRomanCandidates("にんじゃがつきをほえる。");
    expect(row?.text).toBe("忍者が月を吼える。");
    expect(row?.readingKana).toBe("にんじゃがつきをほえる。");
    expect(row?.readingRomanJson).toBe(JSON.stringify(roman));
    expect(row?.keystrokeCount).toBe(countKeystrokes(roman));
  });

  it("存在しないお題は NOT_FOUND", async () => {
    const stub = stubReading("しのび。");
    const { status, body } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "nothing", text: "忍者が月を吼える。" }),
    });
    stub.mockRestore();

    expect(status).toBe(404);
    expect((body.error as { code: string }).code).toBe("NOT_FOUND");
  });

  it("打てない文字を含む本文は、読みを取る前に弾く", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    // 「」は日本語だがキーボードで打てない。isTypableText のホワイトリストで弾く
    const stub = stubReading("しのび。");

    const { status, body } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", text: "忍者「参上」。" }),
    });
    const called = stub.mock.calls.length;
    stub.mockRestore();

    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("VALIDATION_ERROR");
    // 読み取得（外部サブリクエスト）を消費していない
    expect(called).toBe(0);
    // 弾かれた編集で本文が壊れていない
    const [row] = await db.select().from(prompts).where(eq(prompts.id, "p1"));
    expect(row?.text).toBe("手裏剣が闇を裂いた。");
  });

  it("漢字を含まない本文は弾く", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });

    const { status, body } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", text: "にんじゃがつきをほえる。" }),
    });

    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("打鍵数が範囲外の読みは弾く", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    // 読み「あ。」は2打。下限10に届かない
    const stub = stubReading("あ。");

    const { status, body } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", text: "亜。" }),
    });
    stub.mockRestore();

    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("読みに打てないかなが残ったら弾く", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    // ルビ振りAPIがカタカナを返した場合。ローマ字候補が組めず打てないお題になる
    const stub = stubReading("シュリケン");

    const { status, body } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", text: "手裏剣。" }),
    });
    stub.mockRestore();

    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("最適化テーマでは、読みに「含む」文字が無い編集は弾く", async () => {
    await seedTheme({ id: "c1", kind: "constraint", name: "ざ", normalizedName: "ざ" });
    await seedPrompt({ id: "p1", themeId: "c1", sequenceNumber: 1 });
    const stub = stubReading("にんじゃがつきをほえる。");

    const { status, body } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", text: "忍者が月を吼える。" }),
    });
    stub.mockRestore();

    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("最適化テーマでも、読みに「含む」文字があれば通す（表記に無くてよい）", async () => {
    await seedTheme({ id: "c1", kind: "constraint", name: "ざ", normalizedName: "ざ" });
    await seedPrompt({ id: "p1", themeId: "c1", sequenceNumber: 1 });
    // 座頭 → ざとう。表記に「ざ」は無いが読みにある
    const stub = stubReading("ざとういちがつきをほえる。");

    const { status } = await request("/admin/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "p1", text: "座頭市が月を吼える。" }),
    });
    stub.mockRestore();

    expect(status).toBe(200);
  });
});

describe("DELETE /admin/prompts/:id", () => {
  it("お題を1件だけ消す", async () => {
    await seedTheme({ id: "t1" });
    await seedPrompt({ id: "p1", themeId: "t1", sequenceNumber: 1 });
    await seedPrompt({ id: "p2", themeId: "t1", sequenceNumber: 2 });

    const { status, body } = await request("/admin/prompts/p1", { method: "DELETE" });

    expect(status).toBe(200);
    expect(body).toEqual({ deleted: true, promptId: "p1" });
    const rows = await db.select().from(prompts);
    expect(rows.map((r) => r.id)).toEqual(["p2"]);
  });

  it("存在しないお題は NOT_FOUND", async () => {
    const { status, body } = await request("/admin/prompts/nothing", { method: "DELETE" });

    expect(status).toBe(404);
    expect((body.error as { code: string }).code).toBe("NOT_FOUND");
  });
});
