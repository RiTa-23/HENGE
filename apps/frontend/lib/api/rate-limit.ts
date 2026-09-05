import { getCloudflareContext } from "@opennextjs/cloudflare";
import { errorResponse } from "@/lib/api/error";

/**
 * 生成系エンドポイントの連打を弾く。
 *
 * 日次クォータ（50回/日）とは別物。`RATE_LIMITED` は数秒〜1分で解消し、
 * `QUOTA_EXCEEDED` は日付が変わるまで解消しない。どちらも429だが、案内文が
 * 変わるためコードで区別する。
 *
 * キーはユーザーID。IPアドレスにしないのは、生成系がいずれも要認証で、
 * 共有回線の背後にいる複数ユーザーを巻き添えにする理由が無いため。
 *
 * **クォータ判定より先に呼ぶこと。** 弾かれたリクエストで `GET /usage/:userId`
 * を引くのは無駄で、連打を弾く目的にも反する。
 *
 * 通ったときは null を返し、弾いたときはそのまま返せるレスポンスを返す。
 */
export async function limitGeneration(userId: string): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const { success } = await env.GENERATION_RATE_LIMIT.limit({ key: userId });
  return success ? null : errorResponse("RATE_LIMITED");
}

/**
 * バックグラウンド補充をキックしてよいか。
 *
 * **弾いても429を返さない。** プレイ自体はクォータを消費しない行為なので止めず、
 * 補充のキックだけを落とす（残数0のときと同じ扱い）。呼び出し側は結果を
 * `allowRefill` に畳み込む。新しいエラー経路もクライアント側の対応も要らない。
 *
 * 生成系（limitGeneration）とは別の枠を使う。同じ枠にすると、遊んでいるだけで
 * テーマ作成の予算が減る。
 *
 * 補充が実際に要るかは在庫数を持つ Hono 側にしか分からないため、補充の不要な
 * プレイでも1消費する。上限がプレイの頻度基準（10回/60秒）なのはそのため。
 */
export async function canKickRefill(userId: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const { success } = await env.REFILL_RATE_LIMIT.limit({ key: userId });
  return success;
}
