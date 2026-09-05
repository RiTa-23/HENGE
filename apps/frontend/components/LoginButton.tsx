"use client";

import { authClient } from "@/lib/api/auth-client";

/**
 * ログイン・ログアウトの導線。Phase 5 時点での最小構成で、ヘッダー等の
 * 画面構成は Phase 6 で作り込む。Googleプロバイダのみ。
 */
export function LoginButton() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;

  const className =
    "rounded-full border border-kinari/20 px-4 py-1.5 text-sm tracking-widest text-kinari/80 transition-colors hover:border-kin hover:text-kinari";

  if (session) {
    return (
      <button type="button" onClick={() => authClient.signOut()} className={className}>
        ログアウト
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => authClient.signIn.social({ provider: "google" })}
      className={className}
    >
      Googleでログイン
    </button>
  );
}
