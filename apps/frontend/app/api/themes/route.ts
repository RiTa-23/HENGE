import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { themeListQuerySchema, themeNameSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** テーマ／含む文字の一覧。認証不要 */
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = themeListQuerySchema.safeParse(query);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.themes.$get({
      query: {
        kind: parsed.data.kind,
        sort: parsed.data.sort,
        ...(parsed.data.limit === undefined ? {} : { limit: String(parsed.data.limit) }),
        ...(parsed.data.cursor === undefined ? {} : { cursor: String(parsed.data.cursor) }),
      },
    }),
  );
}

/** 新規作成。初回15問を同期生成するため認証が要る */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return errorResponse("UNAUTHORIZED");

  const parsed = themeNameSchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message);
  }

  // TODO(#43): クォータの判定をここで行う（加算はHono側）
  const client = await backendClient();
  return relay(await client.themes.$post({ json: { ...parsed.data, userId } }));
}
