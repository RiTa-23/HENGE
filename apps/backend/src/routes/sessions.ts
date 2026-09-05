import { PLAY_SIZE, STOCK_TARGET } from "@henge/shared";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { fetchPromptRange, type PlayablePrompt } from "../db/prompts";
import { getPlayOffset, setPlayOffset } from "../db/progress";
import { getThemeDetail, incrementPlayCount } from "../db/themes";
import { fail } from "../http/error";

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

  // 在庫が1プレイ分に満たない
  if (theme.promptCount - offset < PLAY_SIZE) return fail(c, "THEME_EXHAUSTED");

  const prompts: PlayablePrompt[] = await fetchPromptRange(
    db,
    body.themeId,
    offset + 1,
    offset + PLAY_SIZE,
  );
  // 連番に歯抜けがある場合。設計上は起きないが、起きたときに黙って短く配らない
  if (prompts.length < PLAY_SIZE) return fail(c, "THEME_EXHAUSTED");

  const nextOffset = offset + PLAY_SIZE;
  // **返した時点で消費が確定する。** 中断しても巻き戻さない
  if (body.userId !== undefined) await setPlayOffset(db, body.userId, body.themeId, nextOffset);
  await incrementPlayCount(db, body.themeId);

  const remainingInPool = theme.promptCount - nextOffset;

  return c.json({
    prompts: shuffle(prompts),
    nextOffset,
    remainingInPool,
    // 補充のキックは #38 で繋ぐ。ここでは判定だけを返す
    quotaConsumed: false,
    needsRefill:
      body.userId !== undefined &&
      remainingInPool < STOCK_TARGET &&
      theme.generationStatus === "ok",
  });
});
