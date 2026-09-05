import { createAuth } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * ログイン中のユーザーID。未ログインなら null。
 *
 * 認証は Next.js Worker 側で完結させる（不変条件1）。呼び出し側は null を
 * UNAUTHORIZED に翻訳する。偽のユーザーIDを返す実装にはしない
 * （動いているように見えて、認可が素通りになる）。
 *
 * セッションの検証には D1 への照合が走る（Better Auth がセッションをD1に持つ）。
 * 認証テーブル限定のD1例外については docs/02-architecture.md を参照。
 */
export async function currentUserId(request: Request): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}
