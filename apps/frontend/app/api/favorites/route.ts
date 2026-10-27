import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { favoriteSchema } from "@/lib/api/schema";
import { currentSession } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/**
 * お気に入りの登録（PUT）と解除（DELETE）。**ログインユーザーだけ。**
 *
 * 匿名は持たない（匿名ユーザーのデータをサーバーに持たない＝不変条件10）ので、匿名の画面には
 * ボタンを出さない。`userId` は本文で受けず、必ずセッションから取る（他人のお気に入りを
 * 触る口を作らない）。
 */
export async function PUT(request: Request) {
  return handle(request, "put");
}

export async function DELETE(request: Request) {
  return handle(request, "delete");
}

async function handle(request: Request, method: "put" | "delete") {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");

  const parsed = favoriteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  const json = { userId: session.user.id, themeId: parsed.data.themeId };
  return relay(
    method === "put"
      ? await client.favorites.$put({ json })
      : await client.favorites.$delete({ json }),
  );
}
