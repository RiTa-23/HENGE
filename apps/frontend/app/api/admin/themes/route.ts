import { backendClient, relay } from "@/lib/api/backend";
import { forbidNonAdmin } from "@/lib/api/admin";
import { errorResponse } from "@/lib/api/error";
import { adminListQuerySchema } from "@/lib/api/schema";

export const dynamic = "force-dynamic";

/** 管理用のテーマ一覧。kind で絞らず作成順に返す。管理者のみ */
export async function GET(request: Request) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = adminListQuerySchema.safeParse(query);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.admin.themes.$get({
      query: {
        ...(parsed.data.limit === undefined ? {} : { limit: String(parsed.data.limit) }),
        ...(parsed.data.cursor === undefined ? {} : { cursor: String(parsed.data.cursor) }),
      },
    }),
  );
}
