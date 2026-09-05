import { STOCK_TARGET } from "@henge/shared";
import type { Db } from "../db/client";
import { appendPrompts, recentPromptTexts } from "../db/prompts";
import { incrementUsage } from "../db/usage";
import { setGenerationStatus, type ThemeDetail } from "../db/themes";
import { acquireThemeLock, releaseThemeLock } from "../kv/lock";
import { createGetReading } from "../reading/index";
import { generateBatch } from "./batch";
import { resolveModel } from "./model";
import { EXISTING_CONTEXT_SIZE } from "./prompt";

/**
 * バックグラウンド補充。
 *
 * **発火できるのはログインユーザーだけ。** クォータ残の判定は Next.js 側で行い、
 * 「allowRefill」フラグとしてここへ渡る（判定はNext.js・記録はHonoの分担）。
 * 発火したユーザーのクォータを1消費する。目標は件数ではなく在庫水準
 * （総生成数 ≥ オフセット + 30）。
 *
 * @returns キックしたかどうか。ロックが取れなければ false（クォータも消費しない）
 */
export async function kickRefill(
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void,
  input: { db: Db; theme: ThemeDetail; nextOffset: number; userId: string },
): Promise<boolean> {
  // 最初の1件だけがロックを取り、他はスキップする
  if (!(await acquireThemeLock(env.KV, input.theme.id))) return false;

  waitUntil(refill(env, input));
  return true;
}

async function refill(
  env: Env,
  input: { db: Db; theme: ThemeDetail; nextOffset: number; userId: string },
): Promise<void> {
  const { db, theme, nextOffset, userId } = input;
  try {
    const model = resolveModel(env.GENERATION_MODEL);
    const result = await generateBatch(env, {
      kind: theme.kind,
      name: theme.name,
      themeId: theme.id,
      path: "refill",
      // 在庫水準まで戻すのに必要な件数
      target: nextOffset + STOCK_TARGET - theme.promptCount,
      existing: await recentPromptTexts(db, theme.id, EXISTING_CONTEXT_SIZE),
      model,
      getReading: createGetReading(env),
    });

    if (result.valid.length > 0) {
      await appendPrompts(db, theme.id, result.valid, model);
      // **1件でも有効なお題が増えたらクォータを消費する**（AIコストは1件でも
      // 消費しているため）。在庫目標まで積み上がらなくても部分追加は価値がある。
      // 加算はappendの後。逆にするとappendが失敗したときにクォータだけ減る
      // （判定 → 生成 → 加算の順）。
      await incrementUsage(db, userId);
    }

    // 何度やっても在庫が積み上がらないテーマの印。無駄な再試行を止める。
    // 既存の在庫は普通に配信され続ける。1件も増えなかった場合も立てる
    // （増えた場合は部分追加でも目標未達なら difficult のまま）
    if (!result.reachedTarget) await setGenerationStatus(db, theme.id, "difficult");
  } catch (error) {
    // 誰も待っていない処理なので、失敗しても握って記録するだけにする。
    // **ここで 'difficult' を立てない。** AIやAPIの一時的な障害は
    // 「このテーマは生成しにくい」とは別物で、印を立てると以後の補充が止まってしまう。
    // 例外時はクォータも消費しない（生成に失敗した場合はカウントしない）
    console.error("背景補充に失敗した", { themeId: theme.id, error });
  } finally {
    await releaseThemeLock(env.KV, theme.id);
  }
}
