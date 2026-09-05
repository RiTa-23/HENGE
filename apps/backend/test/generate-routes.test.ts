import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user } from "../src/db/schema";
import { themeIdKey, themeLockKey } from "../src/kv/keys";

const db = createDb(env.DB);

/** AIの応答と読み取得を差し替える。外部APIは呼ばない */
function stubGeneration(lines: string[][]) {
  let call = 0;
  vi.spyOn(env.AI, "run").mockImplementation(async () => ({
    response: (lines[call++] ?? []).join("\n"),
  }));
  vi.spyOn(env.AI, "gateway").mockReturnValue({
    patchLog: async () => {},
  } as unknown as ReturnType<typeof env.AI.gateway>);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    // Yahoo API だけを差し替える。Worker自身への fetch は素通しする
    if (!url.includes("yahooapis")) return realFetch(input as RequestInfo);
    return Response.json({
      result: { word: [{ surface: "しのび", furigana: "しのび" }] },
    });
  });
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

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.delete(prompts);
  await db.delete(themes);
  await db.delete(user);
  await env.KV.delete(themeIdKey("theme", "忍びの心得"));
  await env.KV.delete(themeLockKey("t1"));
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
    stubGeneration([["あ"], ["あ"]]);
    await post("/themes", { kind: "theme", name: "忍びの心得", userId: "u1" });

    expect(await env.KV.get(themeIdKey("theme", "忍びの心得"))).toBeNull();
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
    await env.KV.put(themeLockKey("t1"), "1", { expirationTtl: 60 });

    const { status, body } = await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(status).toBe(409);
    expect((body.error as { code: string }).code).toBe("GENERATION_IN_PROGRESS");
  });

  it("失敗してもロックを解放する", async () => {
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    stubGeneration([["あ"], ["あ"]]);

    await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(await env.KV.get(themeLockKey("t1"))).toBeNull();
  });

  it("存在しないテーマはエラーになる", async () => {
    const { status } = await post("/prompts/regenerate", { themeId: "none", userId: "u1" });
    expect(status).toBe(400);
  });
});
