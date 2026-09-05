import { getCloudflareContext } from "@opennextjs/cloudflare";
import { denyIfNotAdmin } from "@/lib/api/admin-guard";
import { currentSession } from "@/lib/api/session";

/**
 * `/api/admin/*` の認可。セッションと `ADMIN_EMAILS` を集めて
 * `denyIfNotAdmin()` に渡すだけ。判定そのものはそちらにある（テスト可能にするため）。
 */
export async function forbidNonAdmin(request: Request): Promise<Response | null> {
  const session = await currentSession(request);
  const { env } = await getCloudflareContext({ async: true });
  return denyIfNotAdmin(session, env.ADMIN_EMAILS);
}
