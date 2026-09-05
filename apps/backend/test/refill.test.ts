/* oxlint-disable no-await-in-loop -- D1のバインド変数上限に合わせて分割投入するため（sessions.test.ts と同じ理由） */
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db/client";
import { getThemeDetail } from "../src/db/themes";
import { getUsageCount } from "../src/db/usage";
import { kickRefill } from "../src/generation/refill";
import { prompts, themes, user, userGenerationUsage } from "../src/db/schema";
import { themeLockKey } from "../src/kv/keys";

const db = createDb(env.DB);

const AI_TEXT = "忍びは闇を走る。";
const AI_READING = "しのびはやみをはしる。";

async function seed() {
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
  });
  const rows = Array.from({ length: 44 }, (_, i) => ({
    id: `p${i + 1}`,
    themeId: "t1",
    text: `お題${i + 1}`,
    readingKana: "おだい",
    readingRomanJson: '[["o"],["da"],["i"]]',
    keystrokeCount: 12,
    source: "workers_ai" as const,
    sequenceNumber: i + 1,
  }));
  for (let i = 0; i < rows.length; i += 10) {
    await db.insert(prompts).values(rows.slice(i, i + 10));
  }
}

/** Yahoo ルビ振りAPI の応答を差し替える（外部サブリクエストを消費しない） */
function stubYahooReading() {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          result: { word: [{ surface: AI_TEXT, furigana: AI_READING }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
}

function stubAi(response: unknown) {
  vi.spyOn(env.AI, "run").mockResolvedValue(response as never);
  vi.spyOn(env.AI, "gateway").mockReturnValue({
    patchLog: async () => {},
  } as unknown as ReturnType<typeof env.AI.gateway>);
}

/** kickRefill の waitUntil に渡った promise を溜めて、テスト側で完了を待つ */
function manualWaitUntil() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    flush: async () => {
      await Promise.all(pending.splice(0));
    },
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.delete(prompts);
  await db.delete(userGenerationUsage);
  await db.delete(themes);
  await db.delete(user);
  await env.KV.delete(themeLockKey("t1"));
});

describe("kickRefill のクォータ消費（判定→生成→加算の順）", () => {
  it("1件でも有効なお題が増えたらクォータを1消費する", async () => {
    await seed();
    stubAi({ response: AI_TEXT });
    stubYahooReading();
    const { waitUntil, flush } = manualWaitUntil();

    const theme = (await getThemeDetail(db, "t1"))!;
    // 在庫44に対し nextOffset=15 → target = 15 + 30 - 44 = 1
    const kicked = await kickRefill(env, waitUntil, {
      db,
      theme,
      nextOffset: 15,
      userId: "u1",
    });
    expect(kicked).toBe(true);
    await flush();

    // お題が1件増え、クォータも1増える
    const promptsAfter = await db.select().from(prompts);
    expect(promptsAfter).toHaveLength(45);
    expect(await getUsageCount(db, "u1")).toBe(1);
  });

  it("有効なお題が1件も増えなければクォータを消費しない", async () => {
    await seed();
    stubAi({ response: "" }); // 全件バリデーション落ち → valid 0件
    const { waitUntil, flush } = manualWaitUntil();

    const theme = (await getThemeDetail(db, "t1"))!;
    const kicked = await kickRefill(env, waitUntil, {
      db,
      theme,
      nextOffset: 15,
      userId: "u1",
    });
    expect(kicked).toBe(true);
    await flush();

    expect(await getUsageCount(db, "u1")).toBe(0);
    // 目標未達なので 'difficult' が立つ
    const [row] = await db.select().from(themes).where(eq(themes.id, "t1"));
    expect(row?.generationStatus).toBe("difficult");
  });

  it("生成が例外で失敗してもクォータを消費しない", async () => {
    await seed();
    vi.spyOn(env.AI, "run").mockRejectedValue(new Error("AI障害"));
    const { waitUntil, flush } = manualWaitUntil();

    const theme = (await getThemeDetail(db, "t1"))!;
    const kicked = await kickRefill(env, waitUntil, {
      db,
      theme,
      nextOffset: 15,
      userId: "u1",
    });
    expect(kicked).toBe(true);
    await flush();

    // 生成に失敗した場合はカウントしない
    expect(await getUsageCount(db, "u1")).toBe(0);
    // 一時的な障害で 'difficult' を立てない（以後の補充が止まるため）
    const [row] = await db.select().from(themes).where(eq(themes.id, "t1"));
    expect(row?.generationStatus).toBe("ok");
    // ロックは解放される（次のプレイで補充を再キックできる）
    expect(await env.KV.get(themeLockKey("t1"))).toBeNull();
  });

  it("ロックが取れなければキックせず、クォータも消費しない", async () => {
    await seed();
    await env.KV.put(themeLockKey("t1"), "1", { expirationTtl: 60 });
    const { waitUntil, flush } = manualWaitUntil();

    const theme = (await getThemeDetail(db, "t1"))!;
    const kicked = await kickRefill(env, waitUntil, {
      db,
      theme,
      nextOffset: 15,
      userId: "u1",
    });
    expect(kicked).toBe(false);
    await flush();

    expect(await getUsageCount(db, "u1")).toBe(0);
  });
});
