import { PLAY_SIZE, STOCK_TARGET } from "@henge/shared";
import { type Context, Hono } from "hono";
import { createDb } from "../db/client";
import { fetchPromptRange, type PlayablePrompt } from "../db/prompts";
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
  if (theme === null) return fail(c, "VALIDATION_ERROR", "テーマが見つかりません");

  const offset =
    body.userId === undefined
      ? Math.max(body.offset ?? 0, 0)
      : await getPlayOffset(db, body.userId, body.themeId);

  // 在庫が1プレイ分に満たない。**「生成中」と「本当に尽きた」を区別する**
  if (theme.promptCount - offset < PLAY_SIZE) return exhausted(c, body.themeId);

  const prompts: PlayablePrompt[] = await fetchPromptRange(
    db,
    body.themeId,
    offset + 1,
    offset + PLAY_SIZE,
  );
  // 連番に歯抜けがある場合。設計上は起きないが、起きたときに黙って短く配らない
  if (prompts.length < PLAY_SIZE) return exhausted(c, body.themeId);

  const nextOffset = offset + PLAY_SIZE;
  // **返した時点で消費が確定する。** 中断しても巻き戻さない
  if (body.userId !== undefined) await setPlayOffset(db, body.userId, body.themeId, nextOffset);
  await incrementPlayCount(db, body.themeId);

  const remainingInPool = theme.promptCount - nextOffset;

  // **キックできるのはログインユーザーだけ。** 匿名のプレイでは補充が走らない
  const needsRefill =
    body.userId !== undefined && remainingInPool < STOCK_TARGET && theme.generationStatus === "ok";
  const quotaConsumed = needsRefill
    ? await kickRefill(c.env, (promise) => c.executionCtx.waitUntil(promise), {
        db,
        theme,
        nextOffset,
      })
    : false;

  return c.json({
    prompts: shuffle(prompts),
    nextOffset,
    remainingInPool,
    // 補充が走った場合のみ true。ロックが取れずスキップしたときは消費しない
    quotaConsumed,
  });
});

/**
 * 在庫不足時の分岐。ロックがあれば「生成中」で、クォータを消費させない。
 * 本当に尽きている場合だけ THEME_EXHAUSTED を返す。
 */
async function exhausted(c: Context<{ Bindings: Env }>, themeId: string) {
  if (await isThemeLocked(c.env.KV, themeId)) return fail(c, "GENERATION_IN_PROGRESS");
  return fail(c, "THEME_EXHAUSTED");
}
