import { toJstDateString } from "@henge/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { userGenerationUsage } from "../db/schema";

/**
 * 当日（JST基準）の生成回数。行が無ければ0。
 *
 * 日付は必ず toJstDateString() で作る。素の toISOString() を使うと
 * 上限のリセットが朝9時になる。
 */
export async function getUsageCount(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ count: userGenerationUsage.count })
    .from(userGenerationUsage)
    .where(
      and(eq(userGenerationUsage.userId, userId), eq(userGenerationUsage.date, toJstDateString())),
    );
  return rows[0]?.count ?? 0;
}

/**
 * 生成成功時のカウント加算。UPSERT（PK: user_id + date）。
 *
 * **生成に成功した呼び出し側だけが呼ぶこと。** 先に加算すると、生成失敗時に
 * クォータだけが減る（判定 → 生成 → 加算の順を守る）。
 */
export async function incrementUsage(db: Db, userId: string): Promise<void> {
  await db
    .insert(userGenerationUsage)
    .values({ userId, date: toJstDateString(), count: 1 })
    .onConflictDoUpdate({
      target: [userGenerationUsage.userId, userGenerationUsage.date],
      set: { count: sql`${userGenerationUsage.count} + 1` },
    });
}
