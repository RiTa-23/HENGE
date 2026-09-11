"use client";

import { useState } from "react";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { authClient } from "@/lib/api/auth-client";

/**
 * マイページのユーザー名の編集。フォームそのものは `DisplayNameForm`（ログイン直後の
 * モーダルと共用）で、ここは「保存しました」を出すだけの薄い皮。
 *
 * 現在の名前は**セッション（`useSession`）から取る**。サーバーで描いた `initialName` は
 * セッションが届くまでのつなぎ。名前が未設定の利用者が `/me` を開くとモーダル
 * （`DisplayNameGate`）が先に出るが、そこで保存するとセッションが取り直され、
 * こちらの入力欄も同じ名前で描き直される（`key` で作り直す）。サーバーの値を
 * 持ち続けると、モーダルで保存した直後に**ページ側だけ空欄のまま**になる。
 */
export function MyDisplayName({ initialName }: { initialName: string }) {
  const { data: session } = authClient.useSession();
  const [saved, setSaved] = useState<string | null>(null);
  const current = session?.user.displayName ?? initialName;
  return (
    <div>
      <DisplayNameForm key={current} initialName={current} onSaved={setSaved} />
      {saved !== null && (
        <p role="status" className="mt-4 text-sm text-kinari/60">
          「{saved}」で保存しました。
        </p>
      )}
    </div>
  );
}
