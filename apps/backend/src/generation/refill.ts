import { type PromptForm, stockTarget } from "@henge/shared";
import type { Db } from "../db/client";
import { appendPrompts, recentPromptTexts } from "../db/prompts";
import { recordUsage } from "../db/usage";
import { promptCountOf, setGenerationStatus, type ThemeDetail } from "../db/themes";
import { acquireThemeLock, releaseThemeLock } from "../kv/lock";
import { createGetReading } from "../reading/index";
import { generateBatch } from "./batch";
import { resolveModel } from "./model";
import { existingContextSize } from "./prompt";

/**
 * バックグラウンド補充。
 *
 * **発火できるのはログインユーザーだけ。** クォータ残の判定は Next.js 側で行い、
 * 「allowRefill」フラグとしてここへ渡る（判定はNext.js・記録はHonoの分担）。
 * 発火したユーザーの消費ニューロンを加算する。目標は件数ではなく在庫水準
 * （総生成数 ≥ オフセット + 30）。
 *
 * @returns キックしたかどうか。ロックが取れなければ false（AIを呼ばないので消費もしない）
 */
export async function kickRefill(
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void,
  input: RefillInput,
): Promise<boolean> {
  // 最初の1件だけがロックを取り、他はスキップする。**ロックは形式ごと**
  if (!(await acquireThemeLock(env.KV, input.theme.id, input.form))) return false;

  waitUntil(refill(env, input));
  return true;
}

interface RefillInput {
  db: Db;
  theme: ThemeDetail;
  /** どちらのプールを補充するか */
  form: PromptForm;
  nextOffset: number;
  userId: string;
}

async function refill(env: Env, input: RefillInput): Promise<void> {
  const { db, theme, form, nextOffset, userId } = input;

  try {
    const model = resolveModel(env.GENERATION_MODEL);
    const result = await generateBatch(env, {
      kind: theme.kind,
      form,
      name: theme.name,
      themeId: theme.id,
      path: "refill",
      // 在庫水準まで戻すのに必要な件数
      target: nextOffset + stockTarget(form) - promptCountOf(theme.promptCounts, form),
      existing: await recentPromptTexts(db, theme.id, form, existingContextSize(form)),
      model,
      getReading: createGetReading(env),
      // **消費が確定した直後に記録する。** 補充は waitUntil の中で走り、
      // レスポンス送信から30秒で打ち切られる。終わってから記録する形だと、
      // 打ち切られた回の消費が丸ごと台帳に載らない
      onNeurons: (used) => recordUsage(db, userId, used),
    });

    if (result.valid.length > 0) await appendPrompts(db, theme.id, form, result.valid, model);

    // 何度やっても在庫が積み上がらないテーマの印。無駄な再試行を止める。
    // 既存の在庫は普通に配信され続ける。
    //
    // **単語だけ条件が違う。** 単語は1プレイ30問に対し、1回の補充で作れるのが
    // 最大40件しかない。目標に少し届かなかっただけで印を立てると、**普通に
    // 作れているテーマの補充まで止まる**。単語では「1件も作れなかった」ことだけを
    // 生成困難と見なす。短文は目標未達で立てる（従来どおり）。
    const difficult = form === "word" ? result.valid.length === 0 : !result.reachedTarget;
    if (difficult) await setGenerationStatus(db, theme.id, form, "difficult");
  } catch (error) {
    // 誰も待っていない処理なので、失敗しても握って記録するだけにする。
    // **ここで 'difficult' を立てない。** AIやAPIの一時的な障害は
    // 「このテーマは生成しにくい」とは別物で、印を立てると以後の補充が止まってしまう。
    console.error("背景補充に失敗した", { themeId: theme.id, error });
  } finally {
    // 記録は onNeurons で済んでいる。ここはロックを返すだけ
    await releaseThemeLock(env.KV, theme.id, form);
  }
}
