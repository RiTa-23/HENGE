import { quotaResetAt, remainingNeurons } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { currentSession } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** ユーザー情報と本日の残ニューロン。認証必須 */
export async function GET(request: Request) {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");

  const client = await backendClient();
  const usage = await client.usage[":userId"].$get({ param: { userId: session.user.id } });
  const { neurons } = (await usage.json()) as { count: number; neurons: number };

  return Response.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    neuronsRemaining: remainingNeurons(neurons),
    // リセットは 00:00 UTC（＝日本時間の朝9時）。値は +09:00 表記で返すので、
    // クライアントはそのまま日本時間として見せられる
    quotaResetAt: quotaResetAt(),
  });
}
