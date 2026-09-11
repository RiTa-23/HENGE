"use client";

import { useId, useState } from "react";
import { authClient } from "@/lib/api/auth-client";
import { DISPLAY_NAME_MAX_LENGTH, displayNameSchema } from "@/lib/api/schema";

/**
 * ユーザー名（表示名）の入力・更新。ログイン直後のモーダル（`DisplayNameGate`）と
 * マイページの編集の両方から使う。**フォームを2組持たない。**
 *
 * 更新は Better Auth の `/api/auth/update-user` に直接送る（`authClient.updateUser`）。
 * 検証はサーバー側の `validator.input`（`lib/auth.ts`）にかかるが、**同じ Zod を
 * ここでも先に通す**。規則の二重定義ではなく同じスキーマの共有で、送る前に
 * 弾けば往復が要らない。
 *
 * **ここは `<input>` を使ってよい。** IMEを避けるのは打鍵を拾うプレイ画面だけで、
 * 名前は日本語入力そのものが要る（不変条件7はタイピング判定の話）。
 */
export function DisplayNameForm({
  initialName,
  submitLabel = "保存する",
  autoFocus = false,
  onSaved,
}: {
  /** 現在の表示名。未設定なら空文字 */
  initialName: string;
  submitLabel?: string;
  autoFocus?: boolean;
  /** 保存に成功したあとに呼ぶ。閉じる・文言を出すなどは呼び出し側が決める */
  onSaved?: (displayName: string) => void;
}) {
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "ユーザー名を確認してください");
      return;
    }
    setBusy(true);
    setError(null);

    // 成功すると Better Auth のクライアントがセッションを取り直すので、
    // `useSession()` を見ている側（モーダル・ヘッダー）は自動で新しい名前になる
    const { error: failure } = await authClient.updateUser({ displayName: parsed.data });
    setBusy(false);
    if (failure) {
      setError(failure.message ?? "ユーザー名を保存できませんでした");
      return;
    }
    setName(parsed.data);
    onSaved?.(parsed.data);
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor={inputId} className="block text-sm tracking-widest text-kinari/60">
        ユーザー名（1〜{DISPLAY_NAME_MAX_LENGTH}文字）
      </label>
      <input
        id={inputId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        required
        autoFocus={autoFocus}
        autoComplete="nickname"
        placeholder="影丸"
        className="mt-3 w-full rounded-md border border-kinari/20 bg-kinari/5 px-4 py-3 text-kinari outline-none focus:border-kin"
      />

      {error !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-shu/50 bg-shu/10 px-4 py-3 text-sm text-kinari"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || name.trim() === ""}
        className="mt-6 rounded-md border border-kin px-8 py-2.5 tracking-[0.2em] text-kinari transition-colors hover:bg-kinari/5 disabled:border-kinari/15 disabled:text-kinari/30 disabled:hover:bg-transparent"
      >
        {busy ? "保存中" : submitLabel}
      </button>
    </form>
  );
}
