import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { prompts, themes } from "./schema";
import type { ValidPrompt } from "../generation/batch";
import type { ThemeKind } from "@henge/shared";

/** テーマ内の総生成数。`MAX(sequence_number)` で取れる */
export async function countPrompts(db: Db, themeId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${prompts.sequenceNumber})` })
    .from(prompts)
    .where(eq(prompts.themeId, themeId));
  return row?.max ?? 0;
}

/** 重複回避の文脈として渡す既存お題（直近から） */
export async function recentPromptTexts(db: Db, themeId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ text: prompts.text })
    .from(prompts)
    .where(eq(prompts.themeId, themeId))
    .orderBy(desc(prompts.sequenceNumber))
    .limit(limit);
  return rows.map((row) => row.text);
}

function toRows(themeId: string, model: string, from: number, items: ValidPrompt[]) {
  return items.map((item, index) => ({
    id: crypto.randomUUID(),
    themeId,
    text: item.text,
    readingKana: item.readingKana,
    readingRomanJson: item.readingRomanJson,
    keystrokeCount: item.keystrokeCount,
    source: "workers_ai" as const,
    model,
    sequenceNumber: from + index,
  }));
}

/**
 * テーマとお題を**同じバッチで**挿入する。
 *
 * テーマ行を先に作ると、生成失敗時にお題ゼロのテーマが公開一覧に残り、
 * クリックしても何も遊べない状態になる。
 */
export async function insertThemeWithPrompts(
  db: Db,
  theme: {
    id: string;
    kind: ThemeKind;
    name: string;
    normalizedName: string;
    createdBy: string | null;
  },
  items: ValidPrompt[],
  model: string,
): Promise<void> {
  await db.batch([
    db.insert(themes).values(theme),
    db.insert(prompts).values(toRows(theme.id, model, 1, items)),
  ]);
}

/**
 * 既存テーマにお題を追加する。`sequence_number` は現在の最大値+1から連番で採番する。
 *
 * 採番と挿入の間に別の生成が走ると一意制約に衝突する。
 * 多重起動は `theme:<id>:lock` で防いでいる。
 */
export async function appendPrompts(
  db: Db,
  themeId: string,
  items: ValidPrompt[],
  model: string,
): Promise<number> {
  if (items.length === 0) return 0;
  const from = (await countPrompts(db, themeId)) + 1;
  await db.insert(prompts).values(toRows(themeId, model, from, items));
  return from + items.length - 1;
}
