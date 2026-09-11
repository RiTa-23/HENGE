"use client";

import { authClient } from "@/lib/api/auth-client";

/**
 * ログイン・ログアウトの導線。Googleプロバイダのみ。
 *
 * ログイン中は**マイページへの導線もここに置く**。`NAV_LINKS` は未ログインにも
 * 見せる固定の並びで、ログイン状態で増減する項目はセッションを知っているこの部品が持つ。
 * 広い画面の横並び（`SiteHeader`）と狭い画面のメニュー（`MobileNav`）の両方から使われる。
 */
export function LoginButton() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;

  const className =
    "rounded-full border border-kinari/20 px-4 py-1.5 text-sm tracking-widest text-kinari/80 transition-colors hover:border-kin hover:text-kinari";

  if (session) {
    return (
      <span className="flex items-center gap-6">
        <a href="/me" className="text-sm tracking-widest text-kinari/70 hover:text-kinari">
          マイページ
        </a>
        <button type="button" onClick={() => authClient.signOut()} className={className}>
          ログアウト
        </button>
      </span>
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
