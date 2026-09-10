"use client";

import { isApiError } from "@henge/shared";
import { useCallback, useEffect, useState } from "react";

interface AdminPrompt {
  /** 出題の形式。連番は形式ごとに1から振り直されるので、番号だけでは区別できない */
  form: "sentence" | "word";
  id: string;
  text: string;
  readingKana: string;
  keystrokeCount: number;
  sequenceNumber: number;
  model: string | null;
}

/**
 * テーマ1つ分のお題の一覧と、編集・削除。
 *
 * 編集で送るのは本文だけ。**読み仮名・ローマ字・打鍵数はサーバー側で取り直す**
 * ので、ここで計算した値を送らない（検証の規則が2か所に分かれるため）。
 * サーバーが返した検証エラーは、打鍵数の範囲外など管理者に意味のある情報なので
 * そのまま見せる。
 */
export function AdminPromptList({ themeId }: { themeId: string }) {
  const [prompts, setPrompts] = useState<AdminPrompt[] | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = (response: Response, body: unknown, append: boolean) => {
    if (!response.ok) {
      setError(isApiError(body) ? body.error.message : "一覧を取得できませんでした");
      return;
    }
    const { prompts: next, nextCursor: cursor } = body as {
      prompts: AdminPrompt[];
      nextCursor: number | null;
    };
    setPrompts((current) => (append && current !== null ? [...current, ...next] : next));
    setNextCursor(cursor);
  };

  const load = useCallback(
    async (cursor?: number) => {
      const query = cursor === undefined ? "?limit=50" : `?limit=50&cursor=${cursor}`;
      const response = await fetch(
        `/api/admin/themes/${encodeURIComponent(themeId)}/prompts${query}`,
      );
      const body: unknown = await response.json();
      apply(response, body, cursor !== undefined);
    },
    [themeId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (prompt: AdminPrompt) => {
    setEditingId(prompt.id);
    setDraft(prompt.text);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
    setEditError(null);
  };

  const save = async (promptId: string) => {
    setBusyId(promptId);
    const response = await fetch(`/api/admin/prompts/${encodeURIComponent(promptId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: draft }),
    });
    setBusyId(null);
    if (!response.ok) {
      const body: unknown = await response.json();
      setEditError(isApiError(body) ? body.error.message : "保存できませんでした");
      return;
    }
    cancelEdit();
    await load();
  };

  const remove = async (prompt: AdminPrompt) => {
    // 取り消せない操作なので確認を挟む
    if (!globalThis.confirm(`「${prompt.text}」を削除します。よろしいですか。`)) {
      return;
    }
    setBusyId(prompt.id);
    const response = await fetch(`/api/admin/prompts/${encodeURIComponent(prompt.id)}`, {
      method: "DELETE",
    });
    setBusyId(null);
    if (!response.ok) {
      const body: unknown = await response.json();
      setError(isApiError(body) ? body.error.message : "削除できませんでした");
      return;
    }
    await load();
  };

  if (error !== null) return <p className="mt-10 text-kinari/70">{error}</p>;
  if (prompts === null) return <p className="mt-10 text-kinari/50">読み込み中</p>;

  return (
    <table className="mt-10 w-full text-sm">
      <thead>
        <tr className="border-b border-kinari/10 text-left tracking-widest text-kinari/50">
          <th className="py-3 font-normal">番</th>
          <th className="py-3 font-normal">形式</th>
          <th className="py-3 font-normal">本文</th>
          <th className="py-3 font-normal">読み</th>
          <th className="py-3 text-right font-normal">打鍵</th>
          <th className="py-3 text-right font-normal" />
        </tr>
      </thead>
      <tbody>
        {prompts.map((prompt) => (
          <tr key={prompt.id} className="border-b border-kinari/5 align-top">
            <td className="py-3 font-mono text-kinari/40">{prompt.sequenceNumber}</td>
            <td className="py-3 pr-4 text-xs whitespace-nowrap text-kinari/50">
              {prompt.form === "word" ? "単語" : "短文"}
            </td>
            <td className="py-3 pr-4 font-mincho text-base text-kinari">
              {editingId === prompt.id ? (
                <div>
                  <input
                    type="text"
                    value={draft}
                    maxLength={100}
                    onChange={(event) => setDraft(event.target.value)}
                    className="w-full rounded border border-kinari/20 bg-sumi px-2 py-1 font-mincho text-base text-kinari outline-none focus:border-kin/60"
                  />
                  {editError !== null && <p className="mt-1 text-xs text-shu">{editError}</p>}
                </div>
              ) : (
                prompt.text
              )}
            </td>
            <td className="py-3 pr-4 text-kinari/60">{prompt.readingKana}</td>
            <td className="py-3 text-right font-mono text-kinari/70">{prompt.keystrokeCount}</td>
            <td className="py-3 pl-4 text-right whitespace-nowrap">
              {editingId === prompt.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => void save(prompt.id)}
                    disabled={busyId === prompt.id}
                    className="rounded border border-kin/60 px-3 py-1 text-xs tracking-widest text-kin disabled:opacity-40"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="ml-2 rounded border border-kinari/20 px-3 py-1 text-xs tracking-widest text-kinari/60"
                  >
                    キャンセル
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit(prompt)}
                    className="rounded border border-kin/60 px-3 py-1 text-xs tracking-widest text-kin"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(prompt)}
                    disabled={busyId === prompt.id}
                    className="ml-2 rounded border border-shu/60 px-3 py-1 text-xs tracking-widest text-shu disabled:opacity-40"
                  >
                    削除
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
        {prompts.length === 0 && (
          <tr>
            <td colSpan={6} className="py-10 text-center text-kinari/50">
              お題がありません
            </td>
          </tr>
        )}
      </tbody>
      {nextCursor !== null && (
        <tfoot>
          <tr>
            <td colSpan={6} className="pt-4 text-center">
              <button
                type="button"
                onClick={() => void load(nextCursor)}
                className="rounded border border-kinari/20 px-4 py-1 text-xs tracking-widest text-kinari/60"
              >
                続きを読み込む
              </button>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
