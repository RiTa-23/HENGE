import { canGenerate, quotaResetAt } from "@henge/shared";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { limitGeneration } from "@/lib/api/rate-limit";
import { regenerateSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** 枯渇時の同期再生成。生成を伴うため認証が要る */
export async function POST(request: Request) {
  const userId = await currentUserId(request);
  if (userId === null) return errorResponse("UNAUTHORIZED");

  // 連打はここで弾く。クォータの取得（D1アクセス）より先に判定する
  const limited = await limitGeneration(userId);
  if (limited !== null) return limited;

  const parsed = regenerateSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();

  // クォータの判定はここ（Next.js側）。残数0なら Hono を呼ばずに弾く。
  // 加算は Hono 側（生成に成功した場合のみ）
  const usage = await client.usage[":userId"].$get({ param: { userId } });
  const { count } = (await usage.json()) as { count: number };
  if (!canGenerate(count)) {
    return errorResponse(
      "QUOTA_EXCEEDED",
      `本日の生成上限に達しました。日本時間の翌0時（${quotaResetAt()}）にリセットされます`,
    );
  }

  return relay(await client.prompts.regenerate.$post({ json: { ...parsed.data, userId } }));
}
