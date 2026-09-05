"use client";

import { authClient } from "@/lib/api/auth-client";

/**
 * ログイン・ログアウトの導線。Phase 5 時点での最小構成で、ヘッダー等の
 * 画面構成は Phase 6 で作り込む。Googleプロバイダのみ。
 */
export function LoginButton() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;

  if (session) {
    return (
      <button type="button" onClick={() => authClient.signOut()}>
        ログアウト
      </button>
    );
  }

  return (
    <button type="button" onClick={() => authClient.signIn.social({ provider: "google" })}>
      Googleでログイン
    </button>
  );
}
