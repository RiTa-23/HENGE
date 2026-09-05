/**
 * 管理者（`ADMIN_EMAILS`、カンマ区切り）にメールアドレスが含まれるか。
 * Next.js 側の /api/admin/* の認可判定に使う。Hono 側では判定しない。
 *
 * 区切りごとの空白は許容する。比較は小文字化して行う（Google のメールは
 * 実際上小文字で返るため。厳密な大文字小文字の区別はここでは要求しない）。
 */
export function isAdminEmail(email: string, adminEmails: string): boolean {
  const list = adminEmails
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
  return list.includes(email.toLowerCase());
}
