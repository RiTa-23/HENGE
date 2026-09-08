import { canGenerate, quotaResetAt, remainingNeurons } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";
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
  const body = await res.json();
  if (!res.ok) return Response.json(body, { status: res.status });

  // **その回の消費は Hono の応答（neuronsUsed）から受け取る。** D1をもう一度
  // 読み直すと、加算と読み直しの間に別の生成が挟まったときにずれる
  const { neuronsUsed } = body as { neuronsUsed?: number };
  return Response.json({
    ...body,
    neuronsRemaining: remainingNeurons(neurons + (neuronsUsed ?? 0)),
  });
}
