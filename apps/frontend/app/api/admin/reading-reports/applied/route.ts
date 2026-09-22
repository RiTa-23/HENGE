import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { readingReportAppliedSchema } from "@/lib/api/schema";
import { forbidNonSyncOrAdmin } from "@/lib/api/sync-guard";

export const dynamic = "force-dynamic";

/**
 * 辞書リポの自動PRワークフローからの適用完了通知。
 * user-lex.csv に行が入って（=辞書リポのPRがマージされて）から呼ばれる。
 * `Bearer REPORTS_SYNC_TOKEN` での機械アクセスが主だが管理画面からも打てる。
 */
export async function POST(request: Request) {
  const denied = await forbidNonSyncOrAdmin(request);
  if (denied !== null) return denied;

  const parsed = readingReportAppliedSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(await client.admin["reading-reports"].applied.$post({ json: parsed.data }));
}
