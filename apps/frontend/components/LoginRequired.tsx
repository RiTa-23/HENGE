"use client";

import { authClient } from "@/lib/api/auth-client";

/**
 * ログインが要る画面で、未ログインの人に見せる案内。
 *
 * お題の作成（`CreateThemeForm`）とマイページの両方から使う。文言だけが違うので
 * 1つの部品にし、ボタンの見た目と挙動（Googleプロバイダのみ）を揃える。
 */
export function LoginRequired({ message }: { message: string }) {
  return (
    <div className="mt-10 rounded-md border border-kinari/15 bg-kinari/5 px-8 py-10 text-center">
      <p className="text-kinari/80">{message}</p>
      <button
        type="button"
        onClick={() => authClient.signIn.social({ provider: "google" })}
        className="mt-6 rounded-md border border-shu bg-shu/15 px-8 py-3 tracking-widest text-kinari"
      >
        Googleでログイン
      </button>
    </div>
  );
}
