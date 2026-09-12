/* oxlint-disable no-await-in-loop -- D1のバインド変数上限に合わせて分割投入するため、順に入れる */
import { PLAY_SIZE, PLAY_SIZE_LONG, PLAY_SIZE_WORD, STOCK_TARGET } from "@henge/shared";
import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user, userThemeProgress } from "../src/db/schema";
import { themeLockKey } from "../src/kv/keys";

const db = createDb(env.DB);

async function seed(promptCount: number, over: Partial<typeof themes.$inferInsert> = {}) {
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
    ...over,
  });
  const rows = Array.from({ length: promptCount }, (_, i) => ({
    id: `p${i + 1}`,
    themeId: "t1",
    text: `お題${i + 1}`,
    readingKana: "おだい",
    readingRomanJson: '[["o"],["da"],["i"]]',
    keystrokeCount: 12,
    source: "workers_ai" as const,
    sequenceNumber: i + 1,
  }));
  // D1のバインド変数上限（1クエリ100個）に当たるため分割して入れる
  for (let i = 0; i < rows.length; i += 10) {
    await db.insert(prompts).values(rows.slice(i, i + 10));
  }
}

/** 単語のプールを積む。短文とは別のプールなので連番も1から振る */
async function seedWords(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `w${i + 1}`,
    themeId: "t1",
    form: "word" as const,
    text: `単語${i + 1}`,
    readingKana: "にんじゃ",
    readingRomanJson: '[["ni"],["n"],["ja"]]',
    keystrokeCount: 6,
    source: "workers_ai" as const,
    sequenceNumber: i + 1,
  }));
  for (let i = 0; i < rows.length; i += 10) {
    await db.insert(prompts).values(rows.slice(i, i + 10));
  }
}

async function seedLongs(count: number) {
  await db.insert(prompts).values(
    Array.from({ length: count }, (_, i) => ({
      id: `l${i + 1}`,
      themeId: "t1",
      form: "long" as const,
      text: `長文${i + 1}`,
      readingKana: "ちょうぶん",
      readingRomanJson: '[["cho","tyo","cyo"],["u"],["bu"],["n","nn","xn"]]',
      keystrokeCount: 300,
      source: "workers_ai" as const,
      sequenceNumber: i + 1,
    })),
  );
}

async function start(body: Record<string, unknown>) {
  const res = await SELF.fetch("http://backend/sessions/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** 背景補充がAIを呼ぶため、テストでは応答を差し替える（remoteBindings: false で実物は使えない） */
function stubAi() {
  vi.spyOn(env.AI, "run").mockResolvedValue({ response: "" } as never);
  vi.spyOn(env.AI, "gateway").mockReturnValue({
    patchLog: async () => {},
  } as unknown as ReturnType<typeof env.AI.gateway>);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  stubAi();
  await db.delete(prompts);
  await db.delete(userThemeProgress);
  await db.delete(themes);
  await db.delete(user);
  await env.KV.delete(themeLockKey("t1", "sentence"));
});

describe("配信", () => {
  it("15問返す", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", offset: 0 });
    expect((body.prompts as unknown[]).length).toBe(PLAY_SIZE);
  });

  it("ローマ字候補はJSONから復元して返す", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", offset: 0 });
    const first = (body.prompts as { readingRoman: string[][] }[])[0];
    expect(first?.readingRoman[0]).toEqual(["o"]);
  });

  it("オフセットの続きから配る", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", offset: 15 });
    const texts = (body.prompts as { text: string }[]).map((p) => p.text).toSorted();
    expect(texts[0]).toBe("お題16");
    expect(texts.at(-1)).toBe("お題30");
  });

  it("オフセット30でも続きから配る", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", offset: 30 });
    const texts = (body.prompts as { text: string }[]).map((p) => p.text).toSorted();
    expect(texts[0]).toBe("お題31");
    expect(body.nextOffset).toBe(45);
  });

  it("続けて遊ぶとオフセットが進み続ける（巻き戻らない）", async () => {
    await seed(45);
    const first = await start({ themeId: "t1", userId: "u1" });
    const second = await start({ themeId: "t1", userId: "u1" });

    expect(first.body.nextOffset).toBe(15);
    expect(second.body.nextOffset).toBe(30);
    // 2回目に1回目と同じお題が混ざっていない
    const firstTexts = new Set((first.body.prompts as { text: string }[]).map((p) => p.text));
    const secondTexts = (second.body.prompts as { text: string }[]).map((p) => p.text);
    expect(secondTexts.some((text) => firstTexts.has(text))).toBe(false);
  });

  it("シャッフルして返す（連番のまま出さない）", async () => {
    await seed(45);
    // 偶然そろう可能性があるため複数回試す
    const orders = await Promise.all(
      [0, 0, 0].map(async () => {
        const { body } = await start({ themeId: "t1", offset: 0 });
        return (body.prompts as { text: string }[]).map((p) => p.text).join(",");
      }),
    );
    const sequential = Array.from({ length: PLAY_SIZE }, (_, i) => `お題${i + 1}`).join(",");
    expect(orders.every((order) => order === sequential)).toBe(false);
  });

  it("nextOffset と remainingInPool を返す", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", offset: 0 });
    expect(body.nextOffset).toBe(15);
    expect(body.remainingInPool).toBe(30);
  });
});

describe("オフセットの扱い", () => {
  it("ログイン時はサーバー側の進捗を使い、更新する", async () => {
    await seed(45);
    await start({ themeId: "t1", userId: "u1" });

    const [row] = await db
      .select()
      .from(userThemeProgress)
      .where(eq(userThemeProgress.userId, "u1"));
    expect(row?.playCount).toBe(15);
  });

  it("ログイン時はクライアントの offset を無視する（改ざんで先に進めない）", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", userId: "u1", offset: 30 });
    expect(body.nextOffset).toBe(15);
  });

  it("匿名はサーバーに進捗を持たない", async () => {
    await seed(45);
    await start({ themeId: "t1", offset: 0 });
    expect(await db.select().from(userThemeProgress)).toHaveLength(0);
  });

  it("負のオフセットは0として扱う", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", offset: -100 });
    expect(body.nextOffset).toBe(15);
  });

  it("プレイ回数を+1する（人気順の材料）", async () => {
    await seed(45);
    await start({ themeId: "t1", offset: 0 });
    const [row] = await db.select().from(themes).where(eq(themes.id, "t1"));
    expect(row?.totalPlayCount).toBe(1);
  });
});

describe("補充のキック", () => {
  it("残りが30を下回り、許可されていればキックする", async () => {
    await seed(44); // 15問配ると残り29
    const { body } = await start({ themeId: "t1", userId: "u1", allowRefill: true });
    expect(body.remainingInPool).toBe(STOCK_TARGET - 1);
    expect(body.refillKicked).toBe(true);
    // ロックを取っている
    expect(await env.KV.get(themeLockKey("t1", "sentence"))).not.toBeNull();
  });

  it("残りがちょうど30ならキックしない（境界値）", async () => {
    await seed(45);
    const { body } = await start({ themeId: "t1", userId: "u1", allowRefill: true });
    expect(body.remainingInPool).toBe(STOCK_TARGET);
    expect(body.refillKicked).toBe(false);
  });

  it("匿名ではキックしない（在庫を消費するだけ）", async () => {
    await seed(44);
    const { body } = await start({ themeId: "t1", offset: 0 });
    expect(body.refillKicked).toBe(false);
    expect(await env.KV.get(themeLockKey("t1", "sentence"))).toBeNull();
  });

  it("生成困難なテーマではキックしない", async () => {
    await seed(44, { generationStatus: "difficult" });
    const { body } = await start({ themeId: "t1", userId: "u1", allowRefill: true });
    expect(body.refillKicked).toBe(false);
  });

  it("すでにロックが取られていればキックせず、クォータも消費しない", async () => {
    await seed(44);
    await env.KV.put(themeLockKey("t1", "sentence"), "1", { expirationTtl: 60 });

    const { body } = await start({ themeId: "t1", userId: "u1", allowRefill: true });
    expect(body.refillKicked).toBe(false);
  });

  it("許可フラグが無ければキックしない（Next.jsが残数0と判定した場合）", async () => {
    await seed(44);
    const { body } = await start({ themeId: "t1", userId: "u1" });
    expect(body.refillKicked).toBe(false);
    expect(await env.KV.get(themeLockKey("t1", "sentence"))).toBeNull();
  });

  it("許可フラグがfalseでもプレイ自体は成功する（プレイはクォータを消費しないため）", async () => {
    await seed(44);
    const { status, body } = await start({ themeId: "t1", userId: "u1", allowRefill: false });
    expect(status).toBe(200);
    expect((body.prompts as unknown[]).length).toBe(PLAY_SIZE);
    expect(body.refillKicked).toBe(false);
  });
});

describe("枯渇", () => {
  it("在庫が15問に満たなければ THEME_EXHAUSTED", async () => {
    await seed(14);
    const { status, body } = await start({ themeId: "t1", offset: 0 });
    expect(status).toBe(409);
    expect((body.error as { code: string }).code).toBe("THEME_EXHAUSTED");
  });

  it("オフセットが在庫を追い越していれば THEME_EXHAUSTED", async () => {
    await seed(20);
    const { body } = await start({ themeId: "t1", offset: 15 });
    expect((body.error as { code: string }).code).toBe("THEME_EXHAUSTED");
  });

  it("枯渇時はオフセットを進めない", async () => {
    await seed(14);
    await start({ themeId: "t1", userId: "u1" });
    expect(await db.select().from(userThemeProgress)).toHaveLength(0);
  });

  it("生成ロックがあれば GENERATION_IN_PROGRESS（本当に尽きたのと区別する）", async () => {
    await seed(14);
    await env.KV.put(themeLockKey("t1", "sentence"), "1", { expirationTtl: 60 });

    const { status, body } = await start({ themeId: "t1", offset: 0 });
    expect(status).toBe(409);
    expect((body.error as { code: string }).code).toBe("GENERATION_IN_PROGRESS");
  });

  it("存在しないテーマは NOT_FOUND を返す", async () => {
    const { status } = await start({ themeId: "none", offset: 0 });
    expect(status).toBe(404);
  });
});

describe("形式ごとに別のプール・別の進捗", () => {
  it("単語を指定すると、単語のお題が1プレイ分（30問）返る", async () => {
    await seed(PLAY_SIZE);
    await seedWords(PLAY_SIZE_WORD);

    const { status, body } = await start({ themeId: "t1", form: "word", offset: 0 });

    expect(status).toBe(200);
    expect(body.prompts).toHaveLength(PLAY_SIZE_WORD);
    // 短文が1問も混ざらない
    expect((body.prompts as { text: string }[]).every((p) => p.text.startsWith("単語"))).toBe(true);
    expect(body.nextOffset).toBe(PLAY_SIZE_WORD);
  });

  it("単語の在庫が無ければ、短文の在庫があっても枯渇として返る", async () => {
    await seed(PLAY_SIZE * 3);

    const { body } = await start({ themeId: "t1", form: "word", offset: 0 });

    expect((body.error as { code: string }).code).toBe("THEME_EXHAUSTED");
  });

  /**
   * **これが混ざると、遊んでいない短文のお題が飛ばされる。**
   * 単語を1プレイ（30問）遊んだぶんだけ短文のオフセットも進むと、次に短文を
   * 開いたときに31問目から配られる。
   */
  it("単語を遊んでも、短文の進捗は進まない", async () => {
    await seed(PLAY_SIZE * 3);
    await seedWords(PLAY_SIZE_WORD);

    await start({ themeId: "t1", form: "word", userId: "u1" });

    const rows = await db.select().from(userThemeProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.form).toBe("word");
    expect(rows[0]?.playCount).toBe(PLAY_SIZE_WORD);

    // 短文はまだ1問も配っていないので、1問目から始まる
    const { body } = await start({ themeId: "t1", form: "sentence", userId: "u1" });
    expect(body.nextOffset).toBe(PLAY_SIZE);
    expect((body.prompts as { text: string }[]).some((p) => p.text === "お題1")).toBe(true);
  });

  it("長文を指定すると、長文が1本（1プレイ分）返り、オフセットは1進む", async () => {
    await seed(PLAY_SIZE);
    await seedLongs(3);

    const { status, body } = await start({ themeId: "t1", form: "long", offset: 0 });

    expect(status).toBe(200);
    expect(body.prompts).toHaveLength(PLAY_SIZE_LONG);
    expect((body.prompts as { text: string }[])[0]?.text.startsWith("長文")).toBe(true);
    expect(body.nextOffset).toBe(PLAY_SIZE_LONG);
    expect(body.remainingInPool).toBe(2);
  });

  it("長文の在庫が1本も無ければ枯渇", async () => {
    await seed(PLAY_SIZE);

    const { body } = await start({ themeId: "t1", form: "long", offset: 0 });

    expect((body.error as { code: string }).code).toBe("THEME_EXHAUSTED");
  });

  it("形式を省略すると短文になる（既存のクライアントを壊さない）", async () => {
    await seed(PLAY_SIZE);

    const { body } = await start({ themeId: "t1", offset: 0 });

    expect(body.prompts).toHaveLength(PLAY_SIZE);
  });
});
