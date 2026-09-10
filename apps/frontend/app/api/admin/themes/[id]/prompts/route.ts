import { forbidNonAdmin } from "@/lib/api/admin";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { adminPromptListQuerySchema, themeIdParamSchema } from "@/lib/api/schema";

export const dynamic = "force-dynamic";

/** テーマ1つ分のお題一覧。管理者のみ。中身の確認と、編集・削除の入口になる */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const params = themeIdParamSchema.safeParse(await context.params);
  const query = adminPromptListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!params.success || !query.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.admin.prompts.$get({
      query: {
        themeId: params.data.id,
        form: query.data.form,
        ...(query.data.limit === undefined ? {} : { limit: String(query.data.limit) }),
        ...(query.data.cursor === undefined ? {} : { cursor: String(query.data.cursor) }),
      },
    }),
  );
}
