import { canGenerate, remainingQuota } from "@henge/shared";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { sessionStartSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** プレイ開始。匿名でも遊べる */
export async function POST(request: Request) {
  const parsed = sessionStartSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const userId = await currentUserId(request);
  const client = await backendClient();

  if (userId === null) {
    return relay(
      await client.sessions.start.$post({
        json: { themeId: parsed.data.themeId, offset: parsed.data.offset ?? 0 },
      }),
    );
  }

  // ログイン時: クォータ残を判定して、補充の許可フラグを作る。
  // **判定はNext.js、記録はHono**（docs/04-api.md）。usage の取得はレスポンスの
  // quotaRemaining にも使うため、この1回で済ませ、Hono側では同じ値を引き直さない
  const usage = await client.usage[":userId"].$get({ param: { userId } });
  const { count } = (await usage.json()) as { count: number };

  const res = await client.sessions.start.$post({
    json: {
      themeId: parsed.data.themeId,
      userId,
      // 残数0でもプレイは許可する（クォータを消費しない行為のため）。
      // 補充のキックだけ許可しない
      allowRefill: canGenerate(count),
    },
  });
  const body = await res.json();
  if (!res.ok) return Response.json(body, { status: res.status });
  return Response.json({ ...body, quotaRemaining: remainingQuota(count) });
}
