import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { favorites, themes } from "./schema";
import type { ThemeSummary } from "./themes";

/** マイページに並べる上限。登録の新しい順にこの件数まで */
export const FAVORITE_LIST_LIMIT = 100;

/** お気に入りにできる kind。おまかせ・ごちゃまぜ（`mix`）はサイトに決まった数しかない入口なので外す */
const FAVORITE_KINDS = ["theme", "constraint"] as const;

/**
 * 本人のお気に入り（登録の新しい順）。一覧と同じ形（`ThemeSummary`）で返すので、
 * マイページはそのまま `ThemeCard` に渡せる
 */
export async function listFavorites(db: Db, userId: string): Promise<ThemeSummary[]> {
  return db
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
    .from(favorites)
    .innerJoin(themes, eq(themes.id, favorites.themeId))
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt))
    .limit(FAVORITE_LIST_LIMIT);
}

/** そのテーマを本人がお気に入りにしているか。詳細ページのボタンの初期状態に使う */
export async function isFavorite(
  db: Db,
  input: { userId: string; themeId: string },
): Promise<boolean> {
  const [row] = await db
    .select({ themeId: favorites.themeId })
    .from(favorites)
    .where(and(eq(favorites.userId, input.userId), eq(favorites.themeId, input.themeId)))
    .limit(1);
  return row !== undefined;
}

/**
 * お気に入りに登録する。**登録済みなら何もしない**（2回押しても1行のまま、日時も変えない）。
 * テーマが無い・対象外の kind なら false
 */
export async function addFavorite(
  db: Db,
  input: { userId: string; themeId: string },
): Promise<boolean> {
  const [theme] = await db
    .select({ id: themes.id })
    .from(themes)
    .where(and(eq(themes.id, input.themeId), inArray(themes.kind, [...FAVORITE_KINDS])))
    .limit(1);
  if (theme === undefined) return false;
  await db.insert(favorites).values(input).onConflictDoNothing();
  return true;
}

/** お気に入りから外す。登録していなくてもエラーにしない */
export async function removeFavorite(
  db: Db,
  input: { userId: string; themeId: string },
): Promise<void> {
  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, input.userId), eq(favorites.themeId, input.themeId)));
}
