import { isAdminEmail } from "@henge/shared";
import { errorResponse } from "@/lib/api/error";

/**
 * `/api/admin/*` を通してよいかの判定。**判定はここ（Next.js側）だけで行う。**
 * Hono 側に同じ判定を置くと二重管理になり、ずれたときに気付けない。
 *
 * Cloudflare の env やセッション取得から切り離してあるのは、**この分岐だけを
 * テストできるようにするため**。ここは1文字の取り違え（`!` の欠落、early return
 * の書き忘れ）が「全員が管理者になる」に直結する場所で、他のテストは緑のまま通る。
 *
 * 通ったときは null、弾いたときはそのまま返せるレスポンスを返す。
 */
export function denyIfNotAdmin(
  session: { user: { email: string } } | null,
  adminEmails: string | undefined,
): Response | null {
  if (session === null) return errorResponse("UNAUTHORIZED");
  // 未設定なら誰も管理者にしない（設定漏れで全員が通る事故を防ぐ）
  if (!isAdminEmail(session.user.email, adminEmails ?? "")) return errorResponse("FORBIDDEN");
  return null;
}
