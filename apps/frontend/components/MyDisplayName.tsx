"use client";

import { useState } from "react";
import { DisplayNameForm } from "@/components/DisplayNameForm";

/**
 * マイページのユーザー名の編集。フォームそのものは `DisplayNameForm`（ログイン直後の
 * モーダルと共用）で、ここは「保存しました」を出すだけの薄い皮。
 *
 * 現在の名前はサーバーで描いた `initialName` から始まり、保存後はフォームの中の値が
 * そのまま現在の名前になる（ページを読み直さなくてもずれない）。
 */
export function MyDisplayName({ initialName }: { initialName: string }) {
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div>
      <DisplayNameForm initialName={initialName} onSaved={setSaved} />
      {saved !== null && (
        <p role="status" className="mt-4 text-sm text-kinari/60">
          「{saved}」で保存しました。
        </p>
      )}
    </div>
  );
}
