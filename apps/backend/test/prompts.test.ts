import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import {
  appendPrompts,
  countPrompts,
  fetchPromptPage,
  insertThemeWithPrompts,
  nextSequenceNumber,
  recentPromptTexts,
} from "../src/db/prompts";
import { prompts, themes } from "../src/db/schema";
import type { ValidPrompt } from "../src/generation/batch";

const db = createDb(env.DB);

function item(text: string): ValidPrompt {
  return { text, readingKana: "あ", readingRomanJson: "[]", keystrokeCount: 12 };
}

const theme = {
  id: "t1",
  kind: "theme" as const,
  name: "忍びの心得",
  normalizedName: "忍びの心得",
  createdBy: null,
};

beforeEach(async () => {
  await db.delete(prompts);
  await db.delete(themes);
});

it("テーマとお題を同じバッチで挿入する", async () => {
  await insertThemeWithPrompts(db, theme, [item("あ"), item("い")], "model-x");

  expect(await db.select().from(themes)).toHaveLength(1);
  expect(await db.select().from(prompts)).toHaveLength(2);
});

it("sequence_number は1始まりの連番になる", async () => {
  await insertThemeWithPrompts(db, theme, [item("あ"), item("い"), item("う")], "model-x");

  const rows = await db.select().from(prompts);
  expect(rows.map((r) => r.sequenceNumber).toSorted()).toEqual([1, 2, 3]);
});

it("追加分は現在の最大値+1から採番される", async () => {
  await insertThemeWithPrompts(db, theme, [item("あ"), item("い")], "model-x");
  await appendPrompts(db, "t1", [item("う"), item("え")], "model-x");

  const rows = await db.select().from(prompts);
  expect(rows.map((r) => r.sequenceNumber).toSorted()).toEqual([1, 2, 3, 4]);
});

it("総生成数は MAX(sequence_number) で取れる", async () => {
  expect(await countPrompts(db, "t1")).toBe(0);
  await insertThemeWithPrompts(db, theme, [item("あ"), item("い")], "model-x");
  expect(await countPrompts(db, "t1")).toBe(2);
});

it("重複回避の文脈は新しい順に取れる", async () => {
  await insertThemeWithPrompts(db, theme, [item("1つ目"), item("2つ目"), item("3つ目")], "model-x");

  expect(await recentPromptTexts(db, "t1", 2)).toEqual(["3つ目", "2つ目"]);
});

it("N_request（20件）を一度に挿入できる", async () => {
  // D1のバインド変数は1クエリ100個まで。お題1件で8個使うため、
  // 分割せずに13件以上入れると too many SQL variables で落ちる
  const items = Array.from({ length: 20 }, (_, i) => item(`お題${i + 1}`));
  await insertThemeWithPrompts(db, theme, items, "model-x");

  expect(await db.select().from(prompts)).toHaveLength(20);
  expect(await countPrompts(db, "t1")).toBe(20);
});

it("追加分も分割して挿入できる", async () => {
  await insertThemeWithPrompts(db, theme, [item("あ")], "model-x");
  await appendPrompts(
    db,
    "t1",
    Array.from({ length: 20 }, (_, i) => item(`追加${i + 1}`)),
    "model-x",
  );

  expect(await countPrompts(db, "t1")).toBe(21);
});

it("生成に使ったモデル名を残す", async () => {
  await insertThemeWithPrompts(db, theme, [item("あ")], "@cf/zai-org/glm-4.7-flash");

  const [row] = await db.select().from(prompts);
  expect(row?.model).toBe("@cf/zai-org/glm-4.7-flash");
});

/**
 * 管理画面からお題を1件消すと連番に穴が空く。
 *
 * **これで配信が壊れてはいけない。** 連番の「値」で範囲指定していた頃は、穴を含む
 * 15問ブロックだけ件数が足りず、配信側がそれを在庫切れと解釈していた。
 * その結果、1件の削除でテーマ全体が「使い切りました」になり、そのブロックに
 * 到達したユーザーは二度と遊べなくなる。
 */
describe("連番に穴が空いた場合", () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => item(`お題${index + 1}`));

  beforeEach(async () => {
    await insertThemeWithPrompts(db, theme, many(20), "model-x");
    // 5番目を消して穴を作る
    await db.delete(prompts).where(eq(prompts.sequenceNumber, 5));
  });

  it("countPrompts は実際に配れる数を返す（最大値ではない）", async () => {
    // MAX(sequence_number) なら20。実際に残っているのは19件
    expect(await countPrompts(db, theme.id)).toBe(19);
  });

  it("穴をまたいでも欠けずに取れる", async () => {
    const page = await fetchPromptPage(db, theme.id, 0, 15);

    expect(page).toHaveLength(15);
    // 5番目が消えた分、6番目が繰り上がる
    expect(page.map((p) => p.text)).not.toContain("お題5");
    expect(page[4]?.text).toBe("お題6");
  });

  it("採番は MAX+1 のまま（件数で採ると既存と衝突する）", async () => {
    // COUNT で採ると20になり、既にある20番と衝突して一意制約に当たる
    expect(await nextSequenceNumber(db, theme.id)).toBe(21);
  });

  it("穴が空いた後でも追記できる", async () => {
    await appendPrompts(db, theme.id, [item("追加分")], "model-x");

    expect(await countPrompts(db, theme.id)).toBe(20);
  });
});
