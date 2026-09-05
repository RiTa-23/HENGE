import { normalizeName, type ThemeKind } from "@henge/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { prompts, themes } from "./schema";

export interface ThemeSummary {
  id: string;
  kind: ThemeKind;
  name: string;
  totalPlayCount: number;
  createdAt: number;
  generationStatus: "ok" | "difficult";
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
    })
    .from(themes)
    .where(and(eq(themes.kind, kind), eq(themes.normalizedName, normalizeName(kind, name))))
    .limit(1);
  return row ?? null;
}

export interface ThemeDetail extends ThemeSummary {
  /** 総生成数。MAX(sequence_number) で取れる */
  promptCount: number;
}

export async function getThemeDetail(db: Db, id: string): Promise<ThemeDetail | null> {
  const [row] = await db
    .select({
      id: themes.id,
      kind: themes.kind,
      name: themes.name,
      totalPlayCount: themes.totalPlayCount,
      createdAt: themes.createdAt,
      generationStatus: themes.generationStatus,
      promptCount: sql<number>`coalesce(max(${prompts.sequenceNumber}), 0)`,
    })
    .from(themes)
    .leftJoin(prompts, eq(prompts.themeId, themes.id))
    .where(eq(themes.id, id))
    .groupBy(themes.id)
    .limit(1);
  return row ?? null;
}

/** プレイ開始のたびに+1。人気順ソートの材料 */
export async function incrementPlayCount(db: Db, themeId: string): Promise<void> {
  await db
    .update(themes)
    .set({ totalPlayCount: sql`${themes.totalPlayCount} + 1` })
    .where(eq(themes.id, themeId));
}

/** 生成できることが実証されたら 'ok' に戻す。生成困難の印を残し続けない */
export async function setGenerationStatus(
  db: Db,
  themeId: string,
  status: "ok" | "difficult",
): Promise<void> {
  await db.update(themes).set({ generationStatus: status }).where(eq(themes.id, themeId));
}

export interface AdminThemeRow extends ThemeDetail {
  /** 運営投入分は NULL。作成者を辿るために管理用一覧にだけ含める */
  createdBy: string | null;
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
      createdBy: themes.createdBy,
      promptCount: sql<number>`coalesce(max(${prompts.sequenceNumber}), 0)`,
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
    themes: rows.slice(0, limit),
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
