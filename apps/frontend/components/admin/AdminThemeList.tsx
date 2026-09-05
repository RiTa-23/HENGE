"use client";

import { isApiError } from "@henge/shared";
import { useCallback, useEffect, useState } from "react";

interface AdminTheme {
  id: string;
  kind: "theme" | "constraint";
  name: string;
  promptCount: number;
  totalPlayCount: number;
  generationStatus: "ok" | "difficult";
  createdBy: string | null;
}

/**
 * テーマの一覧と削除。
 *
 * 削除では `prompts` / `user_theme_progress` がFKのCASCADEで消え、
 * **KVのキャッシュとロックはHono側が明示的に消す**（D1のCASCADEはD1の中でしか
 * 効かない）。ここは呼ぶだけで、消し漏れの責任はサーバー側にある。
 */
export function AdminThemeList() {
  const [themes, setThemes] = useState<AdminTheme[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/themes?limit=50");
    const body: unknown = await response.json();
    if (!response.ok) {
      setError(isApiError(body) ? body.error.message : "一覧を取得できませんでした");
      return;
    }
    setThemes((body as { themes: AdminTheme[] }).themes);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (theme: AdminTheme) => {
    // 取り消せない操作なので確認を挟む
    if (!globalThis.confirm(`「${theme.name}」とそのお題をすべて削除します。よろしいですか。`)) {
      return;
    }
    setDeleting(theme.id);
    const response = await fetch(`/api/admin/themes/${encodeURIComponent(theme.id)}`, {
      method: "DELETE",
    });
    setDeleting(null);
    if (!response.ok) {
      const body: unknown = await response.json();
      setError(isApiError(body) ? body.error.message : "削除できませんでした");
      return;
    }
    await load();
  };

  if (error !== null) return <p className="mt-10 text-kinari/70">{error}</p>;
  if (themes === null) return <p className="mt-10 text-kinari/50">読み込み中</p>;

  return (
    <table className="mt-10 w-full text-sm">
      <thead>
        <tr className="border-b border-kinari/10 text-left tracking-widest text-kinari/50">
          <th className="py-3 font-normal">名前</th>
          <th className="py-3 font-normal">種別</th>
          <th className="py-3 text-right font-normal">お題数</th>
          <th className="py-3 text-right font-normal">プレイ</th>
          <th className="py-3 text-right font-normal" />
        </tr>
      </thead>
      <tbody>
        {themes.map((theme) => (
          <tr key={theme.id} className="border-b border-kinari/5">
            <td className="py-3 font-mincho text-base text-kinari">
              {theme.name}
              {theme.generationStatus === "difficult" && (
                <span className="ml-3 text-xs tracking-widest text-kinari/40">生成困難</span>
              )}
            </td>
            <td className="py-3 text-kinari/60">
              {theme.kind === "theme" ? "テーマ" : "含む文字"}
            </td>
            <td className="py-3 text-right font-mono text-kinari/70">{theme.promptCount}</td>
            <td className="py-3 text-right font-mono text-kinari/70">{theme.totalPlayCount}</td>
            <td className="py-3 text-right">
              <button
                type="button"
                onClick={() => void remove(theme)}
                disabled={deleting === theme.id}
                className="rounded border border-shu/60 px-3 py-1 text-xs tracking-widest text-shu disabled:opacity-40"
              >
                削除
              </button>
            </td>
          </tr>
        ))}
        {themes.length === 0 && (
          <tr>
            <td colSpan={5} className="py-10 text-center text-kinari/50">
              テーマがありません
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
