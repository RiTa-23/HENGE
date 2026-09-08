import { forbidNonAdmin } from "@/lib/api/admin";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { promptIdParamSchema, promptTextSchema } from "@/lib/api/schema";

export const dynamic = "force-dynamic";

/**
 * お題本文の編集。管理者のみ。
 *
 * **読み仮名と打鍵数はHono側で取り直す。** 本文だけ差し替えると、打鍵判定が
 * 古い読みのまま行われ、画面の文と打つべきローマ字が食い違う。生成時と同じ
 * 検査（文字種・漢字・打鍵数・「含む」文字）もそちらで通す。
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const params = promptIdParamSchema.safeParse(await context.params);
  const body = promptTextSchema.safeParse(await request.json());
  if (!params.success || !body.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.admin.prompts.$patch({
      json: { id: params.data.id, text: body.data.text },
    }),
  );
}

/**
 * お題の削除。管理者のみ。
 *
 * 連番は詰め直さない。配信は行数で位置を数えるので穴が空いても壊れない
 * （`apps/backend/src/db/prompts.ts` の `fetchPromptPage`）。
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await forbidNonAdmin(request);
  if (denied !== null) return denied;

  const parsed = promptIdParamSchema.safeParse(await context.params);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(await client.admin.prompts[":id"].$delete({ param: { id: parsed.data.id } }));
}
