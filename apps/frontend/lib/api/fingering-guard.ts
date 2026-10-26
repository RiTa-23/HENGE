import { isAdminEmail } from "@henge/shared";
import { errorResponse } from "@/lib/api/error";

/**
 * 最適化の既定の運指を変えてよいか。**その最適化の作成者か、運営だけ。**
 *
 * 判定はここ（Next.js側）だけで行う（不変条件1。Hono は渡された値を信頼する）。
 * env やセッション取得から切り離してあるのは、`admin-guard.ts` と同じく
 * この分岐だけをテストするため。取り違えると「誰でも他人の最適化の運指を変えられる」になる。
 *
 * `createdBy` は運営投入分・作成者が退会したテーマで null。そのときは運営だけが変えられる。
 */
export function canEditDefaultFingering(
  session: { user: { id: string; email: string } } | null,
  createdBy: string | null,
  adminEmails: string | undefined,
): boolean {
  return ownerOrAdmin(session, createdBy, adminEmails);
}

/** 運指の投稿を消してよいか。**投稿者本人か、運営だけ** */
export function canDeleteFingeringPost(
  session: { user: { id: string; email: string } } | null,
  postedBy: string,
  adminEmails: string | undefined,
): boolean {
  return ownerOrAdmin(session, postedBy, adminEmails);
}

/** 持ち主（`ownerId`）本人か運営か。持ち主が null なら運営だけ（`null === null` で通さない） */
function ownerOrAdmin(
  session: { user: { id: string; email: string } } | null,
  ownerId: string | null,
  adminEmails: string | undefined,
): boolean {
  if (session === null) return false;
  if (ownerId !== null && ownerId === session.user.id) return true;
  // 未設定なら誰も運営にしない（admin-guard.ts と同じ側に倒す）
  return isAdminEmail(session.user.email, adminEmails ?? "");
}

/** Route Handler 用。通すなら null、弾くならそのまま返せるレスポンス */
export function denyIfCannotEditFingering(
  session: { user: { id: string; email: string } } | null,
  createdBy: string | null,
  adminEmails: string | undefined,
): Response | null {
  if (session === null) return errorResponse("UNAUTHORIZED");
  if (!canEditDefaultFingering(session, createdBy, adminEmails)) {
    return errorResponse("FORBIDDEN", "この最適化の運指を変えられるのは、作った人と運営だけです");
  }
  return null;
}
