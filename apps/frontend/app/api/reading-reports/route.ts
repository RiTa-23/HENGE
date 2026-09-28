import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { limitReadingReport } from "@/lib/api/rate-limit";
import { readingReportBatchSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/**
 * 読み違い報告の受付。リザルト画面からまとめて送られる。
 *
 * 認証は必須ではない — 報告は利用者の進捗データではなく、匿名ユーザーの
 * 報告も `userId: null` で受け付ける（不変条件10は匿名の「データ」を
 * サーバーに持たないという制約で、報告はその範疇に入らない）。
 * **匿名でも書ける口なので、連投は入力検証より先に弾く。**
 */
export async function POST(request: Request) {
  const userId = await currentUserId(request);
  const limited = await limitReadingReport(userId, request);
  if (limited !== null) return limited;

  const parsed = readingReportBatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    // 表層がお題文に無い、などの理由はそのまま出す。形の誤りは既定の文言でよい
    const issue = parsed.error.issues[0];
    return errorResponse(
      "VALIDATION_ERROR",
      issue?.code === "custom" || issue?.code === "invalid_format" ? issue.message : undefined,
    );
  }

  const rows = parsed.data.reports.map((report) => Object.assign(report, { userId }));
  const client = await backendClient();
  return relay(await client["reading-reports"].$post({ json: rows }));
}
