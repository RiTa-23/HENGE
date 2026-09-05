import { quotaResetAt, remainingQuota } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { currentSession } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** ユーザー情報と本日の生成残数。認証必須 */
export async function GET(request: Request) {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");

  const client = await backendClient();
  const usage = await client.usage[":userId"].$get({ param: { userId: session.user.id } });
  const { count } = (await usage.json()) as { count: number };

  return Response.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    quotaRemaining: remainingQuota(count),
    // リセットはJST 0時。クライアントはこの時刻を使って案内文を組み立てる
    quotaResetAt: quotaResetAt(),
  });
}
