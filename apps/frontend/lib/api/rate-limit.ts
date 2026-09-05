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
