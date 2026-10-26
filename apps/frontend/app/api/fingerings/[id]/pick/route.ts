import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { fingeringIdParamSchema } from "@/lib/api/schema";
import { currentSession } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/**
 * この投稿を選んだ、を記録する（一覧の並び順＝選んだ人数に使う）。**ログインユーザーだけ。**
 *
 * 1人1つの最適化につき1票で、選び直せば票が移る。匿名は数えない（匿名ユーザーのデータを
 * サーバーに持たない＝不変条件10）ので、匿名の画面は呼ばない。運指そのものの適用は
 * クライアントの localStorage で済んでいて、ここは数えるだけ。
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");

  const parsed = fingeringIdParamSchema.safeParse(await context.params);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.fingerings.picks.$put({
      json: { userId: session.user.id, postId: parsed.data.id },
    }),
  );
}
