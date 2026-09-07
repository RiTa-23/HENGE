import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db/client";
import { prompts, themes, user, userGenerationUsage } from "../src/db/schema";
import { getUsageCount } from "../src/db/usage";
import { themeIdKey, themeLockKey } from "../src/kv/keys";

const db = createDb(env.DB);

/** 文ごとの読み。ルビ振りAPIのスタブが本文から引く */
const READINGS: Record<string, string> = {};

/** AIの応答と読み取得を差し替える。外部APIは呼ばない */
function stubGeneration(lines: string[][]) {
  let call = 0;
  vi.spyOn(env.AI, "run").mockImplementation(async () => ({
    response: (lines[call++] ?? []).join("\n"),
  }));
  vi.spyOn(env.AI, "gateway").mockReturnValue({
    patchLog: async () => {},
  } as unknown as ReturnType<typeof env.AI.gateway>);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    // Yahoo API だけを差し替える。Worker自身への fetch は素通しする
    if (!url.includes("yahooapis")) return realFetch(input as RequestInfo);
    // リクエスト本文の q（元の文）から読みを引く。**全文に同じ読みを返しては
    // いけない** — 読みベースの検証（先頭2かなの重複）で全量が1グループに
    // なって15問に届かなくなる。本物のルビ振りAPIは文ごとに違う読みを返す
    const raw = typeof init?.body === "string" ? init.body : "{}";
    const text = (JSON.parse(raw) as { params?: { q?: string } }).params?.q ?? "";
    return Response.json({
      result: { word: [{ surface: "しのび", furigana: READINGS[text] ?? text }] },
    });
  });
}

/**
 * 1ラウンドで15問以上揃う、**書き出しと読みの頭がばらけた**有効な応答。
 *
 * 全文が同じテンプレ（「Nの忍びが〜」＋同じ読み）だと、テーマ語の一極集中と
 * 同じ形になり、テーマ名・先頭2かなの検証で1グループに潰されて15問に届かない。
 * テーマ「忍びの心得」らしく、文ごとに違う側面・違う切り出し方にしてある。
 * 打鍵数はすべて35打以内、読みの先頭2かなは最大2文までしか重複しない。
 */
function stubValidGeneration() {
  const pairs: [string, string][] = [
    ["忍びは月夜に消える。", "しのびはつきよにきえる。"],
    ["心を澄ませば道は開く。", "こころをすませばみちはひらく。"],
    ["影に潜み息を殺す。", "かげにひそみいきをころす。"],
    ["覚えは剣より鋭い。", "おぼえはけんよりするどい。"],
    ["風の音で敵を知る。", "かぜのおとでてきをしる。"],
    ["墨を研ぎ、心を練る。", "すみをとぎ、こころをねる。"],
    ["灯りを消して夜を渡る。", "あかりをけしてよるをわたる。"],
    ["雪に足跡を残さない。", "ゆきにそくせきをのこさない。"],
    ["水流に逆らわず進む。", "すいりゅうにさからわずすすむ。"],
    ["忍装束は闇に溶ける。", "しのびしょうぞくはやみにとける。"],
    ["任務は夜が明ける前だ。", "にんむはよるがあけるまえだ。"],
    ["竹林で息を整える。", "ちくりんでいきをととのえる。"],
    ["鉤縄を屋根に掛けた。", "かぎなわをやねにかけた。"],
    ["呼吸は川の流れに合わせる。", "こきゅうはかわのながれにあわせる。"],
    ["敵地では名を捨てる。", "てきちではなをすてる。"],
    ["五感を閉ざし、心眼を開く。", "ごかんをとざし、しんがんをひらく。"],
    ["図太さは修練で育つ。", "ずぶさはしゅれんでそだつ。"],
    ["一撃を逃さず決める。", "いちげきをのがさずきめる。"],
    ["煙に紛れて屋根を渡る。", "けむりにまぎれてやねをわたる。"],
    ["修行の道に終わりはない。", "しゅぎょうのみちにおわりはない。"],
  ];
  Object.assign(READINGS, Object.fromEntries(pairs));
  stubGeneration([pairs.map(([text]) => text)]);
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

describe("同期生成のクォータ加算（成功した場合のみ）", () => {
  it("POST /themes で生成に成功したらクォータを1消費する", async () => {
    await seedUser("u1");
    stubValidGeneration();

    const { status, body } = await post("/themes", {
      kind: "theme",
      name: "忍びの心得",
      userId: "u1",
    });

    expect(status).toBe(200);
    expect(body.created).toBe(true);
    expect(await getUsageCount(db, "u1")).toBe(1);
  });

  it("POST /themes で生成に失敗したらクォータを消費しない", async () => {
    await seedUser("u1");
    stubGeneration([["あ"], ["あ"]]);

    await post("/themes", { kind: "theme", name: "忍びの心得", userId: "u1" });

    expect(await getUsageCount(db, "u1")).toBe(0);
  });

  it("既存テーマの再利用ではクォータを消費しない", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });

    const { body } = await post("/themes", { kind: "theme", name: "忍びの心得", userId: "u1" });

    expect(body.created).toBe(false);
    expect(await getUsageCount(db, "u1")).toBe(0);
  });

  it("POST /prompts/regenerate で生成に成功したらクォータを1消費する", async () => {
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
    expect((body.theme as { promptCount: number }).promptCount).toBeGreaterThanOrEqual(15);
    expect(await getUsageCount(db, "u1")).toBe(1);
  });

  it("POST /prompts/regenerate でロックが取れなければクォータを消費しない", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    await env.KV.put(themeLockKey("t1"), "1", { expirationTtl: 60 });

    await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(await getUsageCount(db, "u1")).toBe(0);
  });

  it("POST /prompts/regenerate で生成に失敗したらクォータを消費しない", async () => {
    await seedUser("u1");
    await db.insert(themes).values({
      id: "t1",
      kind: "theme",
      name: "忍びの心得",
      normalizedName: "忍びの心得",
    });
    stubGeneration([["あ"], ["あ"]]);

    await post("/prompts/regenerate", { themeId: "t1", userId: "u1" });

    expect(await getUsageCount(db, "u1")).toBe(0);
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

  it("存在しないテーマは NOT_FOUND を返す", async () => {
    const { status } = await post("/prompts/regenerate", { themeId: "none", userId: "u1" });
    expect(status).toBe(404);
  });
});
