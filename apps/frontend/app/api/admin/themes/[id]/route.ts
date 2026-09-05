import { backendClient, relay } from "@/lib/api/backend";
import { forbidNonAdmin } from "@/lib/api/admin";
import { errorResponse } from "@/lib/api/error";
import { themeIdParamSchema } from "@/lib/api/schema";

export const dynamic = "force-dynamic";

/**
 * テーマの削除。管理者のみ。
 *
 * `prompts` / `user_theme_progress` はFKのCASCADEで一緒に消える。
 * **KVのキャッシュとロックはHono側で明示的に削除する**（D1のCASCADEはD1の中でしか効かない）。
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const parsed = themeIdParamSchema.safeParse(await context.params);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(await client.admin.themes[":id"].$delete({ param: { id: parsed.data.id } }));
}
