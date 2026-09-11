import { etypingScore, type PlayStats, type PromptForm, RANKING_SIZE } from "@henge/shared";
import { and, asc, desc, eq, gt, lt, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import { rankings, user } from "./schema";

export interface RankingEntry {
  rank: number;
  userId: string;
  /** 未設定なら null。登録にはユーザー名が要るので通常は埋まっている */
  displayName: string | null;
  score: number;
  hits: number;
  misses: number;
  elapsedMs: number;
  createdAt: number;
}

/**
 * 上位 `RANKING_SIZE` 件。名前は `user.display_name` を表示時に結合する
 * （記録に名前を持たない。`docs/03-data-model.md`）。
 *
 * 並びは**スコアの降順、同点は先に出した方が上**。刈り込み（`pruneRanking`）と
 * 順位の計算（`rankOf`）も同じ並びで数える。3か所で並びがずれると、一覧に無い人が
 * 「N位」と言われる。
 */
export async function listRankings(
  db: Db,
  themeId: string,
  form: PromptForm,
): Promise<RankingEntry[]> {
  const rows = await db
    .select({
      userId: rankings.userId,
      displayName: user.displayName,
      score: rankings.score,
      hits: rankings.hits,
      misses: rankings.misses,
      elapsedMs: rankings.elapsedMs,
      createdAt: rankings.createdAt,
    })
    .from(rankings)
    .innerJoin(user, eq(user.id, rankings.userId))
    .where(and(eq(rankings.themeId, themeId), eq(rankings.form, form)))
    .orderBy(desc(rankings.score), asc(rankings.createdAt))
    .limit(RANKING_SIZE);
  // select が作った新しいオブジェクトなので、そのまま足してよい（spread を重ねない）
  return rows.map((row, index) => Object.assign(row, { rank: index + 1 }));
}

/** その記録の順位（1始まり）。`RANKING_SIZE` を超えていれば null（一覧に載らない） */
async function rankOf(
  db: Db,
  themeId: string,
  form: PromptForm,
  record: { score: number; createdAt: number },
): Promise<number | null> {
  const [row] = await db
    .select({ better: sql<number>`count(*)` })
    .from(rankings)
    .where(
      and(
        eq(rankings.themeId, themeId),
        eq(rankings.form, form),
        or(
          gt(rankings.score, record.score),
          and(eq(rankings.score, record.score), lt(rankings.createdAt, record.createdAt)),
        ),
      ),
    );
  const rank = (row?.better ?? 0) + 1;
  return rank > RANKING_SIZE ? null : rank;
}

/**
 * 101位以下を消す。**保持するのは上位 `RANKING_SIZE` 件だけ**。
 * 登録のたびに呼ぶので、テーブルがプールごとに100件を超えて育つことはない。
 */
async function pruneRanking(db: Db, themeId: string, form: PromptForm): Promise<void> {
  const keep = db
    .select({ userId: rankings.userId })
    .from(rankings)
    .where(and(eq(rankings.themeId, themeId), eq(rankings.form, form)))
    .orderBy(desc(rankings.score), asc(rankings.createdAt))
    .limit(RANKING_SIZE);
  await db
    .delete(rankings)
    .where(
      and(
        eq(rankings.themeId, themeId),
        eq(rankings.form, form),
        notInArray(rankings.userId, keep),
      ),
    );
}

export interface RegisterResult {
  /** サーバーで計算したスコア */
  score: number;
  /** ベストを更新したか。false なら既存の記録の方が良く、何も書いていない */
  best: boolean;
  /** 保存されている記録（ベスト）の順位。`RANKING_SIZE` 位以内でなければ null */
  rank: number | null;
}

/**
 * 記録の登録。**1人1件（ベスト）**で、既存の記録以下のスコアでは書き換えない。
 *
 * スコアは渡された生の値からここで計算する（`etypingScore`。結果画面と同じ関数）。
 * クライアントが計算したスコアを受け取らないのは、画面とランキングで算出が
 * ずれる余地を作らないため。記録そのものは自己申告で改ざんは防げない
 * （範囲検査は Next.js 側の Zod。`docs/04-api.md`）。
 *
 * 認可（本人か・遊んだか・名前があるか）はここで見ない。`userId` は Next.js が
 * セッションから渡したもので、「遊んだか」の検査はルート側で行う。
 */
export async function registerRanking(
  db: Db,
  params: { userId: string; themeId: string; form: PromptForm; stats: PlayStats },
): Promise<RegisterResult> {
  const { userId, themeId, form, stats } = params;
  const score = etypingScore(stats);

  const [existing] = await db
    .select({ score: rankings.score, createdAt: rankings.createdAt })
    .from(rankings)
    .where(and(eq(rankings.themeId, themeId), eq(rankings.form, form), eq(rankings.userId, userId)))
    .limit(1);

  if (existing !== undefined && existing.score >= score) {
    return { score, best: false, rank: await rankOf(db, themeId, form, existing) };
  }

  const createdAt = Math.floor(Date.now() / 1000);
  await db
    .insert(rankings)
    .values({ themeId, form, userId, score, ...stats, createdAt })
    .onConflictDoUpdate({
      // **主キーと同じ3列を並べる。** 1列でも欠けると ON CONFLICT が主キーに一致しない
      target: [rankings.themeId, rankings.form, rankings.userId],
      set: { score, hits: stats.hits, misses: stats.misses, elapsedMs: stats.elapsedMs, createdAt },
    });
  await pruneRanking(db, themeId, form);

  return { score, best: true, rank: await rankOf(db, themeId, form, { score, createdAt }) };
}
