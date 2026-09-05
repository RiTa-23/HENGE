import { isAdminEmail } from "@henge/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { errorResponse } from "@/lib/api/error";
import { currentSession } from "@/lib/api/session";

/**
 * `/api/admin/*` の認可。**判定はここ（Next.js側）だけで行う。**
 * Hono 側に同じ判定を置くと二重管理になり、ずれたときに気付けない。
 *
 * 通ったときは null を返し、弾いたときはそのまま返せるレスポンスを返す。
 * `FORBIDDEN` の文言は `NOT_FOUND` と同じ「見つかりません」で、権限が無いのか
 * 存在しないのかをクライアントから区別できないようにしてある。
 */
export async function forbidNonAdmin(request: Request): Promise<Response | null> {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");

  const { env } = await getCloudflareContext({ async: true });
  // ADMIN_EMAILS が未設定なら誰も管理者にしない（設定漏れで全員が通る事故を防ぐ）
  if (!isAdminEmail(session.user.email, env.ADMIN_EMAILS ?? "")) {
    return errorResponse("FORBIDDEN");
  }
  return null;
}
