"use client";

import { isApiError } from "@henge/shared";
import { useState } from "react";

/**
 * 詳細ページのお気に入りの切り替え。**ログインユーザーにだけ出す**（呼び出し側が
 * `favoriteStatus` で null を受けたら描かない。匿名のデータはサーバーに持たない＝不変条件10）。
 *
 * 押した瞬間に見た目を切り替え、失敗したら戻して理由を出す。登録したものはマイページの
 * 「お気に入り」に並ぶ。
 *
 * 色は金（装飾・完了の色）。朱は「打つ」だけのものなので使わない（docs/07-ui.md「配色」）。
 */
export function FavoriteButton({
  themeId,
  initialFavorited,
}: {
  themeId: string;
  initialFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async () => {
    const next = !favorited;
    setBusy(true);
    setMessage(null);
    setFavorited(next);
    const response = await fetch("/api/favorites", {
      method: next ? "PUT" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok === true) return;
    setFavorited(!next);
    const body: unknown = await response?.json().catch(() => null);
    setMessage(isApiError(body) ? body.error.message : "保存できませんでした");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={favorited}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs tracking-widest transition-colors disabled:opacity-60 ${
          favorited
            ? "border-kin/60 text-kin"
            : "border-kinari/20 text-kinari/60 hover:border-kin/60 hover:text-kin"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill={favorited ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
        </svg>
        {favorited ? "お気に入り済み" : "お気に入り"}
      </button>
      {message !== null && (
        <p role="alert" className="text-xs text-kinari/60">
          {message}
        </p>
      )}
    </div>
  );
}
