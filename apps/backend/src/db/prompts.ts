import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
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

export interface PlayablePrompt {
  id: string;
  text: string;
  readingKana: string;
  readingRoman: string[][];
}

/**
 * 連番の範囲でお題を取る。`prompts_theme_seq` インデックス1本で賄う。
 * 範囲は両端を含む（from 〜 to）。
 */
export async function fetchPromptRange(
  db: Db,
  themeId: string,
  from: number,
  to: number,
): Promise<PlayablePrompt[]> {
  const rows = await db
    .select({
      id: prompts.id,
      text: prompts.text,
      readingKana: prompts.readingKana,
      readingRomanJson: prompts.readingRomanJson,
    })
    .from(prompts)
    .where(
      and(
        eq(prompts.themeId, themeId),
        gte(prompts.sequenceNumber, from),
        lte(prompts.sequenceNumber, to),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    readingKana: row.readingKana,
    readingRoman: JSON.parse(row.readingRomanJson) as string[][],
  }));
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

/**
 * 1つのINSERT文に載せるお題の数。
 *
 * **D1のバインド変数の上限は1クエリにつき100個**（db.batch() の中の各文にも個別に適用される）。
 * お題1件で8個使うため、13件以上を1文で挿入すると
 * `too many SQL variables` で失敗する。N_request が20なので分割は必須。
 */
const INSERT_CHUNK_SIZE = 10;

type BatchStatement = Parameters<Db["batch"]>[0][number];

/** db.batch は「1件以上」のタプルを要求するが、種類の違う文を混ぜると型が合わない */
function asBatch(statements: unknown[]): [BatchStatement, ...BatchStatement[]] {
  return statements as [BatchStatement, ...BatchStatement[]];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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
  const rows = toRows(theme.id, model, 1, items);
  const inserts = chunk(rows, INSERT_CHUNK_SIZE).map((part) => db.insert(prompts).values(part));
  // テーマ行とお題を同じバッチで入れる。分割してもバッチの中に収める
  await db.batch(asBatch([db.insert(themes).values(theme), ...inserts]));
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
  const rows = toRows(themeId, model, from, items);
  const inserts = chunk(rows, INSERT_CHUNK_SIZE).map((part) => db.insert(prompts).values(part));
  await db.batch(asBatch(inserts));
  return from + items.length - 1;
}
