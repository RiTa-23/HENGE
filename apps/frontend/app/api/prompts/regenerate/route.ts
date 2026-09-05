import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { regenerateSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** 枯渇時の同期再生成。生成を伴うため認証が要る */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return errorResponse("UNAUTHORIZED");

  const parsed = regenerateSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  // TODO(#43): クォータの判定をここで行う（加算はHono側）
  const client = await backendClient();
  return relay(await client.prompts.regenerate.$post({ json: { ...parsed.data, userId } }));
}
