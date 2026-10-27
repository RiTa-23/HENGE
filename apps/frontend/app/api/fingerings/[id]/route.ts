import { getCloudflareContext } from "@opennextjs/cloudflare";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { canDeleteFingeringPost } from "@/lib/api/fingering-guard";
import { fingeringIdParamSchema } from "@/lib/api/schema";
import { currentSession } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** 運指の投稿を消す。**投稿者本人か運営だけ**（`lib/api/fingering-guard.ts`） */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");

  const parsed = fingeringIdParamSchema.safeParse(await context.params);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  const found = await client.fingerings[":id"].$get({ param: { id: parsed.data.id } });
  if (!found.ok) return errorResponse("NOT_FOUND", "投稿が見つかりません");
  const { post } = (await found.json()) as { post: { userId: string } };

  const { env } = await getCloudflareContext({ async: true });
  if (!canDeleteFingeringPost(session, post.userId, env.ADMIN_EMAILS)) {
    return errorResponse("FORBIDDEN", "投稿を消せるのは、投稿した人と運営だけです");
  }
  return relay(await client.fingerings[":id"].$delete({ param: { id: parsed.data.id } }));
}
