"use client";

import { useId } from "react";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { authClient } from "@/lib/api/auth-client";

/**
 * ユーザー名（表示名）が未設定のログインユーザーに、入力させるモーダル。
 *
 * `SiteHeader` に置くので、ヘッダーのある画面ならどこでログインしても出る。
 * この列を足す前に登録した利用者も未設定なので、次に開いたときに同じように出る。
 *
 * **閉じるボタンを置かない。** 名前はランキングなど公開の場に出す前提で、
 * 「あとで」を許すと未設定のまま公開の場に立つことになる。どうしても決めたく
 * なければログアウトで抜けられる。
 *
 * 保存されると Better Auth のクライアントがセッションを取り直し、
 * `displayName` が埋まった時点でこの部品は何も描かなくなる（自分で閉じる状態を持たない）。
 */
export function DisplayNameGate() {
  const { data: session, isPending } = authClient.useSession();
  const titleId = useId();

  if (isPending || !session) return null;
  // null は「まだ決めていない」。空文字は検証で弾くので保存されない
  if (session.user.displayName) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-sumi/85 px-6"
    >
      <div className="w-full max-w-md rounded-md border border-kin/60 bg-sumi px-8 py-10">
        <p className="text-sm tracking-[0.25em] text-kinari/50">はじめに</p>
        <h2 id={titleId} className="mt-3 font-mincho text-2xl tracking-wide text-kinari">
          ユーザー名を決めてください
        </h2>
        <p className="mt-4 text-sm leading-loose text-kinari/70">
          他の人に見える名前です。Googleアカウントの名前は使いません。あとからマイページで変えられます。
        </p>
        <div className="mt-8">
          <DisplayNameForm initialName="" submitLabel="この名前にする" autoFocus />
        </div>
        <p className="mt-8 text-right text-xs tracking-widest text-kinari/40">
          <button type="button" onClick={() => authClient.signOut()} className="hover:text-kinari">
            ログアウトする
          </button>
        </p>
      </div>
    </div>
  );
}
