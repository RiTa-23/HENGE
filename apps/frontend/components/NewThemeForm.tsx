"use client";

import { isApiError } from "@henge/shared";
import { useState } from "react";
import { authClient } from "@/lib/api/auth-client";
import { Shuriken } from "@/components/play/Shuriken";

interface CreatedTheme {
  theme: { name: string };
  created: boolean;
}

/**
 * テーマ作成。生成を伴うので認証が要る。
 *
 * **ここは `<input>` を使ってよい。** IMEを避けるのは打鍵を拾うプレイ画面だけで、
 * テーマ名は日本語入力そのものが要る（不変条件7はタイピング判定の話）。
 */
export function NewThemeForm() {
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return null;

  if (session === null) {
    return (
      <div className="mt-10 rounded-md border border-kinari/15 bg-kinari/5 px-8 py-10 text-center">
        <p className="text-kinari/80">お題を作るにはログインが必要です。</p>
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "theme", name }),
    });
    const body: unknown = await response.json();

    if (!response.ok) {
      // 案内文はサーバーが組み立てたものをそのまま出す。QUOTA_EXCEEDED は
      // リセット時刻を含み、GENERATION_FAILED は名前の変更を促す
      setError(isApiError(body) ? body.error.message : "お題を作れませんでした");
      setBusy(false);
      return;
    }

    // **既存と一致した場合もエラーにしない。** そのテーマへ送る
    const { theme } = body as CreatedTheme;
    globalThis.location.href = `/play/${encodeURIComponent(theme.name)}`;
  };

  if (busy) {
    return (
      <div className="mt-10 flex flex-col items-center gap-6 rounded-md border border-kin/50 bg-kinari/5 px-8 py-14">
        <Shuriken size={72} />
        <p className="text-sm text-kinari/70">お題を作っています</p>
        <p className="text-sm text-kinari/40">＊ 十数秒かかります。閉じずにお待ちください。</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-10">
      <label htmlFor="theme-name" className="block text-sm tracking-widest text-kinari/60">
        テーマ名（1〜30文字）
      </label>
      <input
        id="theme-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={30}
        required
        placeholder="忍びの心得"
        className="mt-3 w-full rounded-md border border-kinari/20 bg-kinari/5 px-4 py-3 text-kinari outline-none focus:border-kin"
      />

      {error !== null && (
        <p className="mt-4 rounded-md border border-shu/50 bg-shu/10 px-4 py-3 text-sm text-kinari">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={name.trim() === ""}
        className="mt-8 rounded-md border border-shu bg-shu/15 px-10 py-3 tracking-[0.2em] text-kinari transition-colors hover:bg-shu/25 disabled:border-kinari/15 disabled:bg-transparent disabled:text-kinari/30"
      >
        作る
      </button>
    </form>
  );
}
