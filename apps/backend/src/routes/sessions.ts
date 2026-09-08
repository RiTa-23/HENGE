import { PLAY_SIZE, STOCK_TARGET } from "@henge/shared";
import { type Context, Hono } from "hono";
import { createDb } from "../db/client";
import { fetchPromptPage, type PlayablePrompt } from "../db/prompts";
import { getPlayOffset, setPlayOffset } from "../db/progress";
import { getThemeDetail, incrementPlayCount } from "../db/themes";
import { kickRefill } from "../generation/refill";
import { fail } from "../http/error";
import { isThemeLocked } from "../kv/lock";

interface StartBody {
  themeId: string;
  /** ログイン時のみ。匿名は offset をクライアントから受け取る */
  userId?: string;
  /** 匿名時のみ必須。改ざんされても他人に影響しないため許容する */
  offset?: number;
  /**
   * バックグラウンド補充の許可フラグ。Next.js 側でクォータ残を判定した結果。
   * Hono 側ではクォータのポリシー値（上限50等）を持たず、このフラグを信頼するだけ
   * （判定はNext.js、記録はHonoの分担）。
   */
  allowRefill?: boolean;
}

/** 出題順が毎回同じにならないよう混ぜる */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export const sessionRoutes = new Hono<{ Bindings: Env }>().post("/sessions/start", async (c) => {
  const body = await c.req.json<StartBody>();
  const db = createDb(c.env.DB);

  const theme = await getThemeDetail(db, body.themeId);
  if (theme === null) return fail(c, "NOT_FOUND", "テーマが見つかりません");

  const offset =
    body.userId === undefined
      ? Math.max(body.offset ?? 0, 0)
      : await getPlayOffset(db, body.userId, body.themeId);

  // 在庫が1プレイ分に満たない。**「生成中」と「本当に尽きた」を区別する**
  if (theme.promptCount - offset < PLAY_SIZE) return exhausted(c, body.themeId);

  const prompts: PlayablePrompt[] = await fetchPromptPage(db, body.themeId, offset, PLAY_SIZE);
  // promptCount と実際に取れた数がずれた場合。並行して削除が走ったときに起こりうる。
  // 黙って短く配らない
  if (prompts.length < PLAY_SIZE) return exhausted(c, body.themeId);

  const nextOffset = offset + PLAY_SIZE;
  // **返した時点で消費が確定する。** 中断しても巻き戻さない
  if (body.userId !== undefined) await setPlayOffset(db, body.userId, body.themeId, nextOffset);
  await incrementPlayCount(db, body.themeId);

  const remainingInPool = theme.promptCount - nextOffset;

  // **キックできるのはログインユーザーだけ。** 匿名のプレイでは補充が走らない。
  // クォータ残が0のときもキックしない（プレイ自体はクォータを消費しない行為なので
  // 止めず、補充だけスキップする。許可フラグは Next.js 側の判定による）
  const needsRefill =
    body.userId !== undefined &&
    body.allowRefill === true &&
    remainingInPool < STOCK_TARGET &&
    theme.generationStatus === "ok";
  const refillKicked =
    needsRefill && body.userId !== undefined
      ? await kickRefill(c.env, (promise) => c.executionCtx.waitUntil(promise), {
          db,
          theme,
          nextOffset,
          userId: body.userId,
        })
      : false;

  return c.json({
    prompts: shuffle(prompts),
    nextOffset,
    remainingInPool,
    // 補充をキックした場合のみ true。ロックが取れずスキップしたときは false。
    // **消費量ではなくキックしたかどうか。** 補充は非同期なので、この時点では
    // 何ニューロン使うか決まっていない（記録はHono側で生成後に行う）
    refillKicked,
  });
});

/**
 * 在庫不足時の分岐。ロックがあれば「生成中」で、生成を走らせない。
 * 本当に尽きている場合だけ THEME_EXHAUSTED を返す。
 */
async function exhausted(c: Context<{ Bindings: Env }>, themeId: string) {
  if (await isThemeLocked(c.env.KV, themeId)) return fail(c, "GENERATION_IN_PROGRESS");
  return fail(c, "THEME_EXHAUSTED");
}
