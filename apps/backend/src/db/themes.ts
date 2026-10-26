import { MIX_NAME, normalizeName, type PromptForm, type ThemeKind } from "@henge/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { prompts, themes } from "./schema";

export type GenerationStatus = "ok" | "difficult";

export interface ThemeSummary {
  id: string;
  kind: ThemeKind;
  name: string;
  totalPlayCount: number;
  createdAt: number;
  /** 短文プールの「生成困難」の印 */
  generationStatus: GenerationStatus;
  /** 単語プールの「生成困難」の印。**短文と分けて持つ**（片方の失敗で両方止めない） */
  wordGenerationStatus: GenerationStatus;
  /** 長文プールの「生成困難」の印。同上 */
  longGenerationStatus: GenerationStatus;
}

/** その形式の印を取る。呼び出し側に `form === "word" ? ... : ...` を書かせない */
export function generationStatusOf(theme: ThemeSummary, form: PromptForm): GenerationStatus {
  if (form === "word") return theme.wordGenerationStatus;
  if (form === "long") return theme.longGenerationStatus;
  return theme.generationStatus;
}

/** 形式ごとの在庫数 */
export type PromptCounts = Record<PromptForm, number>;

/** その形式の在庫数 */
export function promptCountOf(counts: PromptCounts, form: PromptForm): number {
  return counts[form];
}

export const LIST_LIMIT_DEFAULT = 20;
export const LIST_LIMIT_MAX = 50;

/**
 * テーマ／含む文字の一覧。`kind` で分岐する（DB上は同じテーブル）。
 *
 * カーソルは単純なオフセット。人気順は `total_play_count` が動くとページの境目が
 * ずれるが、MVPの規模では実害が無く、キーセットページネーションの実装コストに見合わない。
 */
export async function listThemes(
  db: Db,
  params: { kind: ThemeKind; sort: "popular" | "recent"; limit: number; cursor: number },
): Promise<{ themes: ThemeSummary[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(params.limit, 1), LIST_LIMIT_MAX);
  const rows = await db
    .select({
      id: themes.id,
      kind: themes.kind,
      name: themes.name,
      totalPlayCount: themes.totalPlayCount,
      createdAt: themes.createdAt,
      generationStatus: themes.generationStatus,
      wordGenerationStatus: themes.wordGenerationStatus,
      longGenerationStatus: themes.longGenerationStatus,
    })
    .from(themes)
    .where(eq(themes.kind, params.kind))
    .orderBy(params.sort === "popular" ? desc(themes.totalPlayCount) : desc(themes.createdAt))
    // 次ページの有無を知るために1件多く取る
    .limit(limit + 1)
    .offset(params.cursor);

  const hasMore = rows.length > limit;
  return {
    themes: rows.slice(0, limit),
    nextCursor: hasMore ? params.cursor + limit : null,
  };
}

/**
 * ある利用者が作ったテーマ／含む文字の一覧（マイページ用）。**`kind` で絞らない。**
 *
 * 作った本人が見る一覧なので、テーマと最適化する音を分けずに作成順（新しい順）で
 * 並べる。公開一覧と同じ形（`ThemeSummary`）で返し、お題数は含めない
 * （一覧に集計を持たせない方針は公開一覧と同じ。`docs/04-api.md`）。
 *
 * `userId` は Next.js 側で検証済みのものを信頼する。運営投入分（`created_by` が NULL）は
 * 誰の一覧にも出ない。
 */
export async function listThemesByCreator(
  db: Db,
  params: { userId: string; limit: number; cursor: number },
): Promise<{ themes: ThemeSummary[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(params.limit, 1), LIST_LIMIT_MAX);
  const rows = await db
    .select({
      id: themes.id,
      kind: themes.kind,
      name: themes.name,
      totalPlayCount: themes.totalPlayCount,
      createdAt: themes.createdAt,
      generationStatus: themes.generationStatus,
      wordGenerationStatus: themes.wordGenerationStatus,
      longGenerationStatus: themes.longGenerationStatus,
    })
    .from(themes)
    .where(eq(themes.createdBy, params.userId))
    .orderBy(desc(themes.createdAt))
    // 次ページの有無を知るために1件多く取る
    .limit(limit + 1)
    .offset(params.cursor);

  const hasMore = rows.length > limit;
  return {
    themes: rows.slice(0, limit),
    nextCursor: hasMore ? params.cursor + limit : null,
  };
}

/** 表示名から引く。正規化はここで行い、呼び出し側に正規化の責任を持たせない */
export async function findThemeByName(
  db: Db,
  kind: ThemeKind,
  name: string,
): Promise<ThemeSummary | null> {
  const [row] = await db
    .select({
      id: themes.id,
      kind: themes.kind,
      name: themes.name,
      totalPlayCount: themes.totalPlayCount,
      createdAt: themes.createdAt,
      generationStatus: themes.generationStatus,
      wordGenerationStatus: themes.wordGenerationStatus,
      longGenerationStatus: themes.longGenerationStatus,
    })
    .from(themes)
    .where(and(eq(themes.kind, kind), eq(themes.normalizedName, normalizeName(kind, name))))
    .limit(1);
  return row ?? null;
}

/**
 * ごちゃまぜの行を引く。**無ければ作る**（お題0件のまま）。
 *
 * ごちゃまぜは利用者が作るものではなく、サイトに1つだけある入口なので、作成の操作
 * （`POST /themes`）を通さない。通すと、ベータ版で新規作成を弾いている利用者
 * （`betaLimitation`）が誰も最初の10問を作れない。お題はプレイ画面の「作る」
 * （`POST /prompts/regenerate`）と補充で積む。
 *
 * **お題0件の行を先に作るが、不変条件5（テーマ行はお題と同じバッチで挿入）の理由には
 * 当たらない。** あの条件が防いでいるのは「公開一覧にお題ゼロのテーマが残る」ことで、
 * ごちゃまぜは公開一覧（`kind` で絞る）に出ない。管理画面で消しても、次に引かれたときに
 * 作り直される。
 */
export async function findOrCreateMixTheme(db: Db): Promise<ThemeSummary> {
  const found = await findThemeByName(db, "mix", MIX_NAME);
  if (found !== null) return found;
  // 同時に2つ来ても一意制約 `(kind, normalized_name)` で1行に収まる
  await db
    .insert(themes)
    .values({
      id: crypto.randomUUID(),
      kind: "mix",
      name: MIX_NAME,
      normalizedName: normalizeName("mix", MIX_NAME),
    })
    .onConflictDoNothing();
  const created = await findThemeByName(db, "mix", MIX_NAME);
  if (created === null) throw new Error("ごちゃまぜの行を作れなかった");
  return created;
}

export interface ThemeDetail extends ThemeSummary {
  /** 形式ごとの在庫数 */
  promptCounts: PromptCounts;
  /**
   * 最適化の既定の運指（作成者が決めたもの）。保存したときの JSON をそのまま返す。
   * 決めていない・テーマなら null。形の検査は使う側（Next.js）で音と照らして行う
   */
  defaultFingering: unknown;
}

/** 保存した JSON を返す。壊れていれば決めていない扱いにする（プレイは標準運指で続けられる） */
function parseStoredJson(json: string | null): unknown {
  if (json === null) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/**
 * 形式ごとの在庫数。**`COUNT` で数える（`MAX(sequence_number)` ではない）。**
 *
 * 連番は形式ごとに1から振り直されるので、最大値では両方のプールを混ぜて数えられない。
 * そもそも管理画面から1件消すと連番に穴が空くため、最大値は在庫を多く見積もる
 * （`docs/03-data-model.md`）。実際に配れる数を数える。
 */
const promptCountColumns = {
  sentence: sql<number>`coalesce(sum(case when ${prompts.form} = 'sentence' then 1 else 0 end), 0)`,
  word: sql<number>`coalesce(sum(case when ${prompts.form} = 'word' then 1 else 0 end), 0)`,
  long: sql<number>`coalesce(sum(case when ${prompts.form} = 'long' then 1 else 0 end), 0)`,
};

export async function getThemeDetail(db: Db, id: string): Promise<ThemeDetail | null> {
  const [row] = await db
    .select({
      id: themes.id,
      kind: themes.kind,
      name: themes.name,
      totalPlayCount: themes.totalPlayCount,
      createdAt: themes.createdAt,
      generationStatus: themes.generationStatus,
      wordGenerationStatus: themes.wordGenerationStatus,
      longGenerationStatus: themes.longGenerationStatus,
      defaultFingeringJson: themes.defaultFingeringJson,
      sentenceCount: promptCountColumns.sentence,
      wordCount: promptCountColumns.word,
      longCount: promptCountColumns.long,
    })
    .from(themes)
    .leftJoin(prompts, eq(prompts.themeId, themes.id))
    .where(eq(themes.id, id))
    .groupBy(themes.id)
    .limit(1);
  if (row === undefined) return null;
  const { sentenceCount, wordCount, longCount, defaultFingeringJson, ...theme } = row;
  return {
    ...theme,
    promptCounts: { sentence: sentenceCount, word: wordCount, long: longCount },
    defaultFingering: parseStoredJson(defaultFingeringJson),
  };
}

/**
 * 作成者のユーザーID。運営投入分・作成者が退会したテーマは null。テーマが無ければ undefined。
 *
 * **公開の詳細（`ThemeDetail`）には含めない。** 公開APIがそのまま中継するため、
 * 含めると利用者のIDが誰にでも見える。既定の運指を変えてよいかの判定（Next.js 側）だけが使う
 */
export async function getThemeCreator(
  db: Db,
  id: string,
): Promise<{ createdBy: string | null } | undefined> {
  const [row] = await db
    .select({ createdBy: themes.createdBy })
    .from(themes)
    .where(eq(themes.id, id))
    .limit(1);
  return row;
}

/**
 * 最適化の既定の運指を書き換える。null で外す（標準運指に戻す）。
 * **最適化（`'constraint'`）にしか書かない。** 書き換えたら true
 */
export async function setDefaultFingering(
  db: Db,
  id: string,
  fingering: unknown,
): Promise<boolean> {
  const updated = await db
    .update(themes)
    .set({ defaultFingeringJson: fingering == null ? null : JSON.stringify(fingering) })
    .where(and(eq(themes.id, id), eq(themes.kind, "constraint")))
    .returning({ id: themes.id });
  return updated.length > 0;
}

/** プレイ開始のたびに+1。人気順ソートの材料 */
export async function incrementPlayCount(db: Db, themeId: string): Promise<void> {
  await db
    .update(themes)
    .set({ totalPlayCount: sql`${themes.totalPlayCount} + 1` })
    .where(eq(themes.id, themeId));
}

/**
 * 生成できることが実証されたら 'ok' に戻す。生成困難の印を残し続けない。
 * **印は形式ごと。** 単語が作れないテーマで短文の補充まで止めない。
 */
export async function setGenerationStatus(
  db: Db,
  themeId: string,
  form: PromptForm,
  status: GenerationStatus,
): Promise<void> {
  const column =
    form === "word"
      ? { wordGenerationStatus: status }
      : form === "long"
        ? { longGenerationStatus: status }
        : { generationStatus: status };
  await db.update(themes).set(column).where(eq(themes.id, themeId));
}

export interface AdminThemeRow extends ThemeSummary {
  /** 運営投入分は NULL。作成者を辿るために管理用一覧にだけ含める */
  createdBy: string | null;
  /**
   * **形式ごとの在庫数。** 合計にしない。短文と単語はプールが別で、
   * 補充も生成困難の印も別に動くため、合計では「どちらが足りていないか」が
   * 分からない（管理画面がいちばん見たいのがそこ）
   */
  promptCounts: PromptCounts;
}

/**
 * 管理用の一覧。公開一覧（listThemes）と違い kind で絞らず、作成順に全件返す。
 *
 * 管理画面が見たいのは「いま何があるか」なので、人気順ではなく作成順に固定する。
 * お題数と作成者は削除の判断材料になるため含める（公開一覧には含めない）。
 */
export async function listThemesForAdmin(
  db: Db,
  params: { limit: number; cursor: number },
): Promise<{ themes: AdminThemeRow[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(params.limit, 1), LIST_LIMIT_MAX);
  const rows = await db
    .select({
      id: themes.id,
      kind: themes.kind,
      name: themes.name,
      totalPlayCount: themes.totalPlayCount,
      createdAt: themes.createdAt,
      generationStatus: themes.generationStatus,
      wordGenerationStatus: themes.wordGenerationStatus,
      longGenerationStatus: themes.longGenerationStatus,
      createdBy: themes.createdBy,
      sentenceCount: promptCountColumns.sentence,
      wordCount: promptCountColumns.word,
      longCount: promptCountColumns.long,
    })
    .from(themes)
    .leftJoin(prompts, eq(prompts.themeId, themes.id))
    .groupBy(themes.id)
    .orderBy(desc(themes.createdAt))
    // 次ページの有無を知るために1件多く取る
    .limit(limit + 1)
    .offset(params.cursor);

  const hasMore = rows.length > limit;
  return {
    themes: rows.slice(0, limit).map(({ sentenceCount, wordCount, longCount, ...theme }) =>
      // 分割で作った新しいオブジェクトなので、そのまま足してよい（spread を重ねない）
      Object.assign(theme, {
        promptCounts: { sentence: sentenceCount, word: wordCount, long: longCount },
      }),
    ),
    nextCursor: hasMore ? params.cursor + limit : null,
  };
}

/**
 * テーマを削除する。`prompts` / `user_theme_progress` はFKのCASCADEで一緒に消える。
 *
 * **KVは消えない。** D1のCASCADEはD1の中でしか効かないため、呼び出し側が
 * `theme:<kind>:<normalized_name>` と `theme:<id>:lock` を明示的に削除する必要がある。
 * そのために、消す前に引いた正規化キーを戻り値で返す（消した後では引けない）。
 */
export async function deleteTheme(
  db: Db,
  id: string,
): Promise<{ kind: ThemeKind; normalizedName: string } | null> {
  const [row] = await db
    .select({ kind: themes.kind, normalizedName: themes.normalizedName })
    .from(themes)
    .where(eq(themes.id, id))
    .limit(1);
  if (row === undefined) return null;

  await db.delete(themes).where(eq(themes.id, id));
  return row;
}
