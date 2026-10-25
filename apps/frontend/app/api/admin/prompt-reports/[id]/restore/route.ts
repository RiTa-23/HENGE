import { forbidNonAdmin } from "@/lib/api/admin";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { promptIdParamSchema } from "@/lib/api/schema";

export const dynamic = "force-dynamic";

/**
 * 報告を取り消して、お題を配信に戻す。管理者のみ。
 * 削除はお題の削除（`DELETE /api/admin/prompts/[id]`）をそのまま使う。
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const parsed = promptIdParamSchema.safeParse(await context.params);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.admin["prompt-reports"].restore.$post({ json: { id: parsed.data.id } }),
  );
}
