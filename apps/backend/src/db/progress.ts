import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { userThemeProgress } from "./schema";

/** ログインユーザーの再生オフセット。匿名ユーザーはクライアントのlocalStorageで持つ */
export async function getPlayOffset(db: Db, userId: string, themeId: string): Promise<number> {
  const [row] = await db
    .select({ playCount: userThemeProgress.playCount })
    .from(userThemeProgress)
    .where(and(eq(userThemeProgress.userId, userId), eq(userThemeProgress.themeId, themeId)))
    .limit(1);
  return row?.playCount ?? 0;
}

/**
 * オフセットを進める。**返却した時点で消費が確定する**（中断しても巻き戻さない）。
 * 巻き戻せるようにすると、同じお題を何度も引けてしまい「毎回違うお題」が崩れる。
 */
export async function setPlayOffset(
  db: Db,
  userId: string,
  themeId: string,
  playCount: number,
): Promise<void> {
  await db
    .insert(userThemeProgress)
    .values({ userId, themeId, playCount, updatedAt: sql`(unixepoch())` })
    .onConflictDoUpdate({
      target: [userThemeProgress.userId, userThemeProgress.themeId],
      set: { playCount, updatedAt: sql`(unixepoch())` },
    });
}
