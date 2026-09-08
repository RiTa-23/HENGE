import { toJstDateString } from "@henge/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { userGenerationUsage } from "../db/schema";

export interface DailyUsage {
  /** その日にAIを呼んだ回数。上限の判定には使わない（1回あたりの重さを見る分母） */
  count: number;
  /** その日の消費ニューロン。**上限の判定に使うのはこちら** */
  neurons: number;
}

/**
 * 当日（JST基準）の消費。行が無ければ0。
 *
 * 日付は必ず toJstDateString() で作る。素の toISOString() を使うと
 * 上限のリセットが朝9時になる。
 */
export async function getUsage(db: Db, userId: string): Promise<DailyUsage> {
  const rows = await db
    .select({ count: userGenerationUsage.count, neurons: userGenerationUsage.neurons })
    .from(userGenerationUsage)
    .where(
      and(eq(userGenerationUsage.userId, userId), eq(userGenerationUsage.date, toJstDateString())),
    );
  return { count: rows[0]?.count ?? 0, neurons: rows[0]?.neurons ?? 0 };
}

/**
 * 消費の記録。UPSERT（PK: user_id + date）。
 *
 * **AIを呼んだ側が、成否によらず呼ぶこと。** ニューロンは呼んだ時点で
 * Cloudflare側が消費しており、有効なお題が0件でも戻ってこない。
 * 一度も呼んでいない経路（既存テーマにヒットした等）では呼ばない。
 */
export async function addUsage(db: Db, userId: string, neurons: number): Promise<void> {
  await db
    .insert(userGenerationUsage)
    .values({ userId, date: toJstDateString(), count: 1, neurons })
    .onConflictDoUpdate({
      target: [userGenerationUsage.userId, userGenerationUsage.date],
      set: {
        count: sql`${userGenerationUsage.count} + 1`,
        neurons: sql`${userGenerationUsage.neurons} + ${neurons}`,
      },
    });
}

/**
 * 消費の記録。**失敗しても呼び出し側を落とさない。**
 *
 * 生成の途中から呼ぶため、ここで投げると生成そのものが巻き添えになる。
 * 記録漏れの方が害が小さいので、ログだけ残して先へ進む（消費は AI Gateway
 * 側のログにも残る）。
 */
export async function recordUsage(db: Db, userId: string, neurons: number): Promise<void> {
  try {
    await addUsage(db, userId, neurons);
  } catch (error) {
    console.error("消費の記録に失敗した", { userId, neurons, error });
  }
}
