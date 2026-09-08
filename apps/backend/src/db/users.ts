import { usageDateKey } from "@henge/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { user, userGenerationUsage } from "./schema";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  /** 当日（JST基準）にAIを呼んだ回数。行が無ければ0 */
  todayGenerationCount: number;
  /** 当日（JST基準）の消費ニューロン。**上限に張り付いているかはこちらで見る** */
  todayNeurons: number;
}

export const USER_LIST_LIMIT_DEFAULT = 20;
export const USER_LIST_LIMIT_MAX = 50;

/**
 * 管理用のユーザー一覧（閲覧のみ）。認証テーブルの読み取りをHono側で行うのは、
 * 「D1へのアクセスはHono Workerに閉じる」に従うため（Next.js側のD1例外は
 * Better Auth の読み書きに限る）。
 *
 * 当日の消費を併記するのは、上限に張り付いているユーザーを見つけるため。
 * **上限は消費ニューロンで見る**（`DAILY_NEURON_LIMIT`）。回数も併記するが、
 * それは1回あたりの重さ（消費 ÷ 回数）を読むための分母。
 * 日付は必ず `usageDateKey()` で作る（**00:00 UTC 基準**。`packages/shared`）。
 */
export async function listUsers(
  db: Db,
  params: { limit: number; cursor: number },
): Promise<{ users: AdminUserRow[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(params.limit, 1), USER_LIST_LIMIT_MAX);
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: user.createdAt,
      todayGenerationCount: sql<number>`coalesce(${userGenerationUsage.count}, 0)`,
      todayNeurons: sql<number>`coalesce(${userGenerationUsage.neurons}, 0)`,
    })
    .from(user)
    .leftJoin(
      userGenerationUsage,
      and(eq(userGenerationUsage.userId, user.id), eq(userGenerationUsage.date, usageDateKey())),
    )
    .orderBy(desc(user.createdAt))
    // 次ページの有無を知るために1件多く取る
    .limit(limit + 1)
    .offset(params.cursor);

  const hasMore = rows.length > limit;
  return {
    users: rows.slice(0, limit),
    nextCursor: hasMore ? params.cursor + limit : null,
  };
}
