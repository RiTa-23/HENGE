import type { PromptForm } from "@henge/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { userThemeProgress } from "./schema";

/**
 * ログインユーザーの再生オフセット。匿名ユーザーはクライアントのlocalStorageで持つ。
 *
 * **形式ごとに別々に持つ。** 1つにまとめると、単語を遊んだぶんだけ短文の
 * オフセットも進み、まだ遊んでいない短文のお題が飛ばされる。
 */
export async function getPlayOffset(
  db: Db,
  userId: string,
  themeId: string,
  form: PromptForm,
): Promise<number> {
  const [row] = await db
    .select({ playCount: userThemeProgress.playCount })
    .from(userThemeProgress)
    .where(
      and(
        eq(userThemeProgress.userId, userId),
        eq(userThemeProgress.themeId, themeId),
        eq(userThemeProgress.form, form),
      ),
    )
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
  form: PromptForm,
  playCount: number,
): Promise<void> {
  await db
    .insert(userThemeProgress)
    .values({ userId, themeId, form, playCount, updatedAt: sql`(unixepoch())` })
    .onConflictDoUpdate({
      // **主キーと同じ3列を並べる。** 1列でも欠けると
      // 「ON CONFLICT clause does not match any PRIMARY KEY」で落ちる
      target: [userThemeProgress.userId, userThemeProgress.themeId, userThemeProgress.form],
      set: { playCount, updatedAt: sql`(unixepoch())` },
    });
}
