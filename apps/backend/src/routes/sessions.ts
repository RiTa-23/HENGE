import { mixFormsOf, playSize, type PromptForm, stockTarget } from "@henge/shared";
import { type Context, Hono } from "hono";
import { createDb } from "../db/client";
import { fetchPromptPage, type PlayablePrompt } from "../db/prompts";
import { getPlayOffset, setPlayOffset } from "../db/progress";
import {
  generationStatusOf,
  getThemeDetail,
  incrementPlayCount,
  promptCountOf,
} from "../db/themes";
import { kickRefill } from "../generation/refill";
import { drawMixWords, mixVocabulary } from "../generation/vocabulary";
import { fail } from "../http/error";
import { isThemeLocked } from "../kv/lock";

interface StartBody {
  themeId: string;
  /** 出題の形式。省略時は短文（既存のクライアントを壊さない） */
  form?: PromptForm;
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

  // **形式ごとに別のプール・別のオフセット。** 混ぜると、単語を遊んだぶんだけ
  // 短文のオフセットも進み、遊んでいない短文のお題が飛ばされる
  const form: PromptForm = body.form ?? "sentence";
  const size = playSize(form);

  // **おまかせの単語はプールを持たない。** 語彙リストからその場で取り出す（AI を使わないので、
  // 在庫を積んで共有する意味が無い）。オフセットも補充も無い（docs/05-generation.md）
  if (theme.kind === "mix" && form === "word" && mixFormsOf(theme.name).includes("word")) {
    const words = drawMixWords(mixVocabulary(), size);
    if (words.length < size) return fail(c, "THEME_EXHAUSTED");
    // ログインユーザーは遊んだ回数だけ残す。**ランキングの登録判定**（遊んだ記録があるか）に使う
    if (body.userId !== undefined) {
      const played = await getPlayOffset(db, body.userId, body.themeId, form);
      await setPlayOffset(db, body.userId, body.themeId, form, played + size);
    }
    await incrementPlayCount(db, body.themeId);
    return c.json({ prompts: words, nextOffset: 0, remainingInPool: 0, refillKicked: false });
  }

  const stock = promptCountOf(theme.promptCounts, form);

  const offset =
    body.userId === undefined
      ? Math.max(body.offset ?? 0, 0)
      : await getPlayOffset(db, body.userId, body.themeId, form);

  // 在庫が1プレイ分に満たない。**「生成中」と「本当に尽きた」を区別する**
  if (stock - offset < size) return exhausted(c, body.themeId, form);

  const prompts: PlayablePrompt[] = await fetchPromptPage(db, body.themeId, form, offset, size);
  // 在庫数と実際に取れた数がずれた場合。並行して削除が走ったときに起こりうる。
  // 黙って短く配らない
  if (prompts.length < size) return exhausted(c, body.themeId, form);

  const nextOffset = offset + size;
  // **返した時点で消費が確定する。** 中断しても巻き戻さない
  if (body.userId !== undefined) {
    await setPlayOffset(db, body.userId, body.themeId, form, nextOffset);
  }
  await incrementPlayCount(db, body.themeId);

  const remainingInPool = stock - nextOffset;

  // **キックできるのはログインユーザーだけ。** 匿名のプレイでは補充が走らない。
  // クォータ残が0のときもキックしない（プレイ自体はクォータを消費しない行為なので
  // 止めず、補充だけスキップする。許可フラグは Next.js 側の判定による）
  const needsRefill =
    body.userId !== undefined &&
    body.allowRefill === true &&
    remainingInPool < stockTarget(form) &&
    generationStatusOf(theme, form) === "ok";
  const refillKicked =
    needsRefill && body.userId !== undefined
      ? await kickRefill(c.env, (promise) => c.executionCtx.waitUntil(promise), {
          db,
          theme,
          form,
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
async function exhausted(c: Context<{ Bindings: Env }>, themeId: string, form: PromptForm) {
  if (await isThemeLocked(c.env.KV, themeId, form)) return fail(c, "GENERATION_IN_PROGRESS");
  return fail(c, "THEME_EXHAUSTED");
}
