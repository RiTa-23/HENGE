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

  // セッションのユーザーが変わったときだけ判定し直す（オブジェクトの作り直しでは引かない）
  const userId = session?.user.id ?? null;

  useEffect(() => {
    // **ログアウトしたら消す。** 判定を引かずに return するだけだと、直前の true が残る
    if (userId === null) {
      setIsAdmin(false);
      return;
    }
    let active = true;
    fetch("/api/admin/check")
      .then((res) => (res.ok ? (res.json() as Promise<{ isAdmin?: boolean }>) : { isAdmin: false }))
      .then((body) => {
        if (active) setIsAdmin(body.isAdmin === true);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    // ユーザーが切り替わった後に前のユーザーの判定が届いても反映しない
    return () => {
      active = false;
    };
  }, [userId]);

  if (!isAdmin) return null;

  return (
    <a href="/admin" className={className}>
      管理
    </a>
  );
}
