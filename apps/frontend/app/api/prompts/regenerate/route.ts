import { canGenerate, quotaResetAt } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { generationResponse } from "@/lib/api/generation";
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

  // 残ニューロンの判定はここ（Next.js側）。残っていなければ Hono を呼ばずに弾く。
  // 加算は Hono 側（AIを呼んだ分を、成否によらず記録する）
  const usage = await client.usage[":userId"].$get({ param: { userId } });
  const { neurons } = (await usage.json()) as { count: number; neurons: number };
  if (!canGenerate(neurons)) {
    return errorResponse(
      "QUOTA_EXCEEDED",
      `本日の生成量を使い切りました。日本時間の朝9時（${quotaResetAt()}）にリセットされます`,
    );
  }

  const res = await client.prompts.regenerate.$post({ json: { ...parsed.data, userId } });
  // 失敗でも、AIを呼んだあとならその回の消費を足した残ニューロンを返す
  return generationResponse(res, await res.json(), neurons);
}
