import { canGenerate, quotaResetAt } from "@henge/shared";
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
  const userId = await currentUserId(request);
  if (userId === null) return errorResponse("UNAUTHORIZED");

  const parsed = themeNameSchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message);
  }

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

  return relay(await client.themes.$post({ json: { ...parsed.data, userId } }));
}
