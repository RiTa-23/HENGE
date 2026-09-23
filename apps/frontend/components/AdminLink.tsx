"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/api/auth-client";

/**
 * ヘッダーの「管理」導線。**管理者ログイン中だけ出る。**
 *
 * 管理者判定には `ADMIN_EMAILS`（サーバーのenv）が要るため、クライアントの
 * セッションだけでは決められない。未ログイン時は判定自体が要らないので
 * `/api/admin/check` はログイン中だけ呼ぶ。
 * `LoginButton` と同じく、広い画面の横並びと `MobileNav` の両方から使われる。
 */
export function AdminLink({ className }: { className?: string }) {
  const { data: session } = authClient.useSession();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch("/api/admin/check")
      .then((res) => (res.ok ? (res.json() as Promise<{ isAdmin?: boolean }>) : { isAdmin: false }))
      .then((body) => setIsAdmin(body.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, [session]);

  if (!isAdmin) return null;

  return (
    <a href="/admin" className={className}>
      管理
    </a>
  );
}
