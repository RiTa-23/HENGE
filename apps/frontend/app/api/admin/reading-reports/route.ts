import { forbidNonAdmin } from "@/lib/api/admin";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { readingReportActionSchema, readingReportListQuerySchema } from "@/lib/api/schema";

export const dynamic = "force-dynamic";

/** 報告一覧。管理画面用。`?status=pending|approved|rejected|applied` */
export async function GET(request: Request) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const url = new URL(request.url);
  const parsed = readingReportListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.admin["reading-reports"].$get({
      query: {
        status: parsed.data.status,
        limit: parsed.data.limit?.toString(),
        cursor: parsed.data.cursor?.toString(),
      },
    }),
  );
}

/** 承認/却下。承認時は読みのカタカナ正規化値とコスト値を確定する */
export async function PATCH(request: Request) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const parsed = readingReportActionSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(await client.admin["reading-reports"].$patch({ json: parsed.data }));
}
