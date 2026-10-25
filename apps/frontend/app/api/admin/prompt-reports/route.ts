import { forbidNonAdmin } from "@/lib/api/admin";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { promptReportListQuerySchema } from "@/lib/api/schema";

export const dynamic = "force-dynamic";

/** 報告で配信から外れているお題の一覧。管理者のみ。新しい報告から */
export async function GET(request: Request) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const url = new URL(request.url);
  const parsed = promptReportListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.admin["prompt-reports"].$get({
      query: {
        limit: parsed.data.limit?.toString(),
        cursor: parsed.data.cursor?.toString(),
      },
    }),
  );
}
