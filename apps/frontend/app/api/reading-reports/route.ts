import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { readingReportBatchSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/**
 * 読み違い報告の受付。リザルト画面からまとめて送られる。
 *
 * 認証は必須ではない — 報告は利用者の進捗データではなく、匿名ユーザーの
 * 報告も `userId: null` で受け付ける（不変条件10は匿名の「データ」を
 * サーバーに持たないという制約で、報告はその範疇に入らない）。
 */
export async function POST(request: Request) {
  const parsed = readingReportBatchSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const userId = await currentUserId(request);
  const rows = parsed.data.reports.map((r) => Object.assign(r, { userId }));

  const client = await backendClient();
  return relay(await client["reading-reports"].$post({ json: rows }));
}
