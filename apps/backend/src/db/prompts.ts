import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { prompts, themes } from "./schema";
import type { ValidPrompt } from "../generation/batch";
import type { PromptForm, ThemeKind } from "@henge/shared";

/**
 * テーマ内のお題の数。**`COUNT(*)` で数える（`MAX(sequence_number)` ではない）。**
 *
 * 管理画面からお題を1件消すと連番に穴が空く。最大値で数えると穴の分だけ在庫を
 * 多く見積もり、配信側は「在庫はあるのに15問揃わない」状態になって、そのテーマが
 * 遊べなくなる。実際に配れる数を数えること。
 */
export async function countPrompts(db: Db, themeId: string, form: PromptForm): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(prompts)
    .where(and(eq(prompts.themeId, themeId), eq(prompts.form, form)));
  return row?.count ?? 0;
}

/**
 * 次に採番する `sequence_number`。**こちらは `MAX + 1`。**
 *
 * 件数（`COUNT`）で採番すると、削除で穴が空いたテーマに追加したときに既存の番号と
 * 衝突して一意制約に当たる。「いくつあるか」と「次に何番を振るか」は別物。
 */
export async function nextSequenceNumber(
  db: Db,
  themeId: string,
  form: PromptForm,
): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${prompts.sequenceNumber})` })
    .from(prompts)
    .where(and(eq(prompts.themeId, themeId), eq(prompts.form, form)));
  return (row?.max ?? 0) + 1;
}

export interface PlayablePrompt {
  id: string;
  text: string;
  readingKana: string;
  readingRoman: string[][];
}

/**
 * 生成順に並べて、オフセットの位置から `limit` 件取る。
 *
 * **連番の「値」で範囲指定しない（`BETWEEN from AND to` にしない）。** 管理画面から
 * お題を1件消すと連番に穴が空き、その穴を含むブロックだけ15件に満たなくなる。
 * 配信側はそれを在庫切れと解釈するため、**1件の削除でそのテーマが遊べなくなる。**
 * 並び順にだけ連番を使い、位置は行数で数えることで穴に強くする。
 *
 * 削除の影響は「以降のお題が1つずつ手前にずれる」だけになる。まだ遊んでいない
 * ユーザーには関係がなく、進んでいるユーザーも1問ずれるだけで済む。
 */
export async function fetchPromptPage(
  db: Db,
  themeId: string,
  form: PromptForm,
  offset: number,
  limit: number,
): Promise<PlayablePrompt[]> {
  const rows = await db
    .select({
      id: prompts.id,
      text: prompts.text,
      readingKana: prompts.readingKana,
      readingRomanJson: prompts.readingRomanJson,
    })
    .from(prompts)
    .where(and(eq(prompts.themeId, themeId), eq(prompts.form, form)))
    .orderBy(prompts.sequenceNumber)
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    readingKana: row.readingKana,
    readingRoman: JSON.parse(row.readingRomanJson) as string[][],
  }));
}

/** 重複回避の文脈として渡す既存お題（直近から） */
export async function recentPromptTexts(
  db: Db,
  themeId: string,
  form: PromptForm,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ text: prompts.text })
    .from(prompts)
    .where(and(eq(prompts.themeId, themeId), eq(prompts.form, form)))
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

function toRows(
  themeId: string,
  form: PromptForm,
  model: string,
  from: number,
  items: ValidPrompt[],
) {
  return items.map((item, index) => ({
    id: crypto.randomUUID(),
    themeId,
    form,
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
  // 新規作成で作るのは短文のプールだけ。**単語を同じリクエストで作らない**
  // （1実行の外部サブリクエスト上限50回に対し、2形式で最大80回になる）
  const rows = toRows(theme.id, "sentence", model, 1, items);
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
  form: PromptForm,
  items: ValidPrompt[],
  model: string,
): Promise<number> {
  if (items.length === 0) return 0;
  const from = await nextSequenceNumber(db, themeId, form);
  const rows = toRows(themeId, form, model, from, items);
  const inserts = chunk(rows, INSERT_CHUNK_SIZE).map((part) => db.insert(prompts).values(part));
  await db.batch(asBatch(inserts));
  return from + items.length - 1;
}

export interface AdminPrompt {
  id: string;
  form: PromptForm;
  text: string;
  readingKana: string;
  keystrokeCount: number;
  sequenceNumber: number;
  model: string | null;
  createdAt: number;
}

/** 管理画面のお題一覧。既定の取得件数 */
export const PROMPT_LIST_LIMIT_DEFAULT = 50;

/**
 * テーマ1つ分のお題を生成順で返す。**管理画面専用。**
 *
 * 配信用の `fetchPromptPage` と分けているのは、見せたいものが違うため。
 * 管理者は中身を確認して直すので、読み仮名・打鍵数・連番・生成モデルが要る。
 * 一方プレイ画面はローマ字候補が要るが、連番やモデル名は使わない。
 */
export async function listPromptsForAdmin(
  db: Db,
  themeId: string,
  page: { limit: number; cursor: number },
): Promise<{ prompts: AdminPrompt[]; nextCursor: number | null }> {
  const rows = await db
    .select({
      id: prompts.id,
      form: prompts.form,
      text: prompts.text,
      readingKana: prompts.readingKana,
      keystrokeCount: prompts.keystrokeCount,
      sequenceNumber: prompts.sequenceNumber,
      model: prompts.model,
      createdAt: prompts.createdAt,
    })
    .from(prompts)
    .where(eq(prompts.themeId, themeId))
    // 形式ごとに連番が1から振り直されるので、**form を先に並べる**。
    // 連番だけで並べると短文と単語が交互に出て読めない
    .orderBy(prompts.form, prompts.sequenceNumber)
    .limit(page.limit + 1)
    .offset(page.cursor);

  const hasMore = rows.length > page.limit;
  return {
    prompts: hasMore ? rows.slice(0, page.limit) : rows,
    nextCursor: hasMore ? page.cursor + page.limit : null,
  };
}

/**
 * お題1件と、それが属するテーマの種別・名前。編集時の「含む」検査に要る。
 * **形式も返す**（打鍵数の範囲と文字種の検査が形式で変わるため）。
 */
export async function getPromptWithTheme(
  db: Db,
  promptId: string,
): Promise<{
  id: string;
  themeId: string;
  form: PromptForm;
  kind: ThemeKind;
  themeName: string;
} | null> {
  const [row] = await db
    .select({
      id: prompts.id,
      themeId: prompts.themeId,
      form: prompts.form,
      kind: themes.kind,
      themeName: themes.name,
    })
    .from(prompts)
    .innerJoin(themes, eq(themes.id, prompts.themeId))
    .where(eq(prompts.id, promptId))
    .limit(1);
  return row ?? null;
}

/**
 * お題の本文を差し替える。**読みと打鍵数も必ず一緒に更新する。**
 *
 * 本文だけ変えると、打鍵判定は古い読みのまま行われる。画面に出ている文と
 * 打つべきローマ字が食い違い、**何を打っても進まないお題**ができあがる。
 * 呼び出し側で読みを取り直してから渡すこと。
 */
export async function updatePromptText(
  db: Db,
  promptId: string,
  next: { text: string; readingKana: string; readingRomanJson: string; keystrokeCount: number },
): Promise<void> {
  await db.update(prompts).set(next).where(eq(prompts.id, promptId));
}

/**
 * お題を1件消す。連番は詰め直さない。
 *
 * 詰め直すとテーマ内の全行を書き換えることになり、その間に補充が走ると採番が
 * 衝突する。配信は行数で位置を数えているので（`fetchPromptPage`）、穴が
 * 空いたままでも壊れない。
 */
export async function deletePrompt(db: Db, promptId: string): Promise<boolean> {
  const [row] = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.id, promptId));
  if (row === undefined) return false;
  await db.delete(prompts).where(eq(prompts.id, promptId));
  return true;
}
