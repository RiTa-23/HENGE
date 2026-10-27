import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { fingeringPicks, fingeringPosts, themes, user } from "./schema";

/** 1人が1つの最適化に投稿できる運指の数 */
export const FINGERING_POSTS_PER_USER = 5;

/** 一覧に出す件数の上限。選んだ人数の多い順に上から */
export const FINGERING_LIST_LIMIT = 50;

export interface FingeringPost {
  id: string;
  /** 投稿者。**公開APIでは外す**（Next.js 側で「自分の投稿か」に畳む） */
  userId: string;
  /** 投稿者の表示名。`user.display_name` のいまの値 */
  displayName: string | null;
  /** 保存した JSON をそのまま返す。音と照らすのは使う側 */
  fingering: unknown;
  note: string | null;
  /** この投稿を最後に選んだログインユーザーの数 */
  pickCount: number;
  createdAt: number;
}

/**
 * 最適化の運指の投稿一覧。**選んだ人数の多い順**、同数なら新しい順（同じ秒なら後に作った方）。
 *
 * 人数は `fingering_picks` を投稿ごとに数える（1人1つの最適化につき1票）。
 */
export async function listFingeringPosts(db: Db, themeId: string): Promise<FingeringPost[]> {
  const pickCount = sql<number>`count(${fingeringPicks.userId})`;
  const rows = await db
    .select({
      id: fingeringPosts.id,
      userId: fingeringPosts.userId,
      displayName: user.displayName,
      fingeringJson: fingeringPosts.fingeringJson,
      note: fingeringPosts.note,
      createdAt: fingeringPosts.createdAt,
      pickCount,
    })
    .from(fingeringPosts)
    .innerJoin(user, eq(user.id, fingeringPosts.userId))
    .leftJoin(fingeringPicks, eq(fingeringPicks.postId, fingeringPosts.id))
    .where(eq(fingeringPosts.themeId, themeId))
    .groupBy(fingeringPosts.id)
    // **作成時刻は秒単位なので、同じ秒の投稿は同点になる。** 同点の並びを SQLite 任せにすると
    // 毎回変わりうる（ID の UUID 順に流れる）。挿入順の rowid で「後に作った方が先」に揃える
    .orderBy(desc(pickCount), desc(fingeringPosts.createdAt), desc(sql`${fingeringPosts}.rowid`))
    .limit(FINGERING_LIST_LIMIT);
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    fingering: JSON.parse(row.fingeringJson) as unknown,
    note: row.note,
    pickCount: row.pickCount,
    createdAt: row.createdAt,
  }));
}

/** 投稿1件の持ち主と最適化。削除してよいかの判定（Next.js 側）に使う */
export async function getFingeringPost(
  db: Db,
  id: string,
): Promise<{ id: string; themeId: string; userId: string } | undefined> {
  const [row] = await db
    .select({
      id: fingeringPosts.id,
      themeId: fingeringPosts.themeId,
      userId: fingeringPosts.userId,
    })
    .from(fingeringPosts)
    .where(eq(fingeringPosts.id, id))
    .limit(1);
  return row;
}

export type CreateFingeringPostResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "duplicate" | "limit" };

/**
 * 運指を投稿する。運指の形と、標準運指でないことは Next.js 側で確かめてある。
 *
 * - 最適化（`'constraint'`）でなければ `not_found`
 * - **同じ運指が既にあれば `duplicate`**（誰の投稿でも）。一意制約でも守っているので、
 *   同時に投稿されても2件にはならない（その場合も `duplicate` で返す）
 * - その人がこの最適化に既に5件投稿していれば `limit`
 */
export async function createFingeringPost(
  db: Db,
  input: { themeId: string; userId: string; fingeringJson: string; note: string | null },
): Promise<CreateFingeringPostResult> {
  const [theme] = await db
    .select({ kind: themes.kind })
    .from(themes)
    .where(eq(themes.id, input.themeId))
    .limit(1);
  if (theme?.kind !== "constraint") return { ok: false, reason: "not_found" };

  const [same] = await db
    .select({ id: fingeringPosts.id })
    .from(fingeringPosts)
    .where(
      and(
        eq(fingeringPosts.themeId, input.themeId),
        eq(fingeringPosts.fingeringJson, input.fingeringJson),
      ),
    )
    .limit(1);
  if (same !== undefined) return { ok: false, reason: "duplicate" };

  const [mine] = await db
    .select({ n: count() })
    .from(fingeringPosts)
    .where(and(eq(fingeringPosts.userId, input.userId), eq(fingeringPosts.themeId, input.themeId)));
  if ((mine?.n ?? 0) >= FINGERING_POSTS_PER_USER) return { ok: false, reason: "limit" };

  const id = crypto.randomUUID();
  const inserted = await db
    .insert(fingeringPosts)
    .values({ id, ...input })
    .onConflictDoNothing()
    .returning({ id: fingeringPosts.id });
  return inserted.length === 0 ? { ok: false, reason: "duplicate" } : { ok: true, id };
}

/** 投稿を消す。選んだ人の行（`fingering_picks`）は CASCADE で消える */
export async function deleteFingeringPost(db: Db, id: string): Promise<void> {
  await db.delete(fingeringPosts).where(eq(fingeringPosts.id, id));
}

/**
 * その最適化について、この人が選んだ投稿を記録する（1人1票。選び直せば票が移る）。
 * 投稿が無ければ false
 */
export async function pickFingeringPost(
  db: Db,
  input: { userId: string; postId: string },
): Promise<boolean> {
  const post = await getFingeringPost(db, input.postId);
  if (post === undefined) return false;
  await db
    .insert(fingeringPicks)
    .values({ userId: input.userId, themeId: post.themeId, postId: post.id })
    .onConflictDoUpdate({
      target: [fingeringPicks.userId, fingeringPicks.themeId],
      set: { postId: post.id, updatedAt: sql`(unixepoch())` },
    });
  return true;
}
