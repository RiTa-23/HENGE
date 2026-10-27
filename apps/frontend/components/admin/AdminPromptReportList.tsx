"use client";

import {
  isApiError,
  PROMPT_REPORT_REASON_LABELS,
  type PromptForm,
  type PromptReportReason,
  type ThemeKind,
} from "@henge/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonBody } from "@/lib/api/json";
import { ADMIN_KIND_LABELS, formLabel } from "@/lib/ui/kind";

interface ReportedPrompt {
  id: string;
  themeId: string;
  themeKind: ThemeKind;
  themeName: string;
  form: PromptForm;
  text: string;
  readingKana: string;
  reportedAt: number;
  reportedBy: string | null;
  reportReason: PromptReportReason | null;
}

/** 1回に読む件数。これより多いときは「さらに読む」で続きを引く */
const PAGE_SIZE = 50;

/**
 * おかしなお題の報告キュー。
 *
 * ここに並ぶお題は**報告の時点ですでに配信から外れている**。管理者が決めるのは
 * 「復帰（報告を取り消して配信に戻す）」か「削除」かだけで、放っておいても出題はされない。
 * 削除はテーマのお題一覧と同じ口（`DELETE /api/admin/prompts/[id]`）を使う。
 */
export function AdminPromptReportList() {
  const [prompts, setPrompts] = useState<ReportedPrompt[] | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** 「さらに読む」と操作後の再読み込みが前後したとき、古い応答で一覧を上書きしない */
  const latestRequest = useRef(0);

  const load = useCallback(async (cursor: number) => {
    const request = ++latestRequest.current;
    const response = await fetch(`/api/admin/prompt-reports?limit=${PAGE_SIZE}&cursor=${cursor}`);
    const body = await readJsonBody(response);
    if (request !== latestRequest.current) return;
    if (!response.ok) {
      setError(isApiError(body) ? body.error.message : "一覧を取得できませんでした");
      return;
    }
    const page = body as { prompts: ReportedPrompt[]; nextCursor: number | null };
    setPrompts((current) => {
      if (cursor === 0) return page.prompts;
      // オフセット方式なので、読むあいだに報告が増えると前のページの末尾がもう一度来る
      const shown = new Set((current ?? []).map((p) => p.id));
      return [...(current ?? []), ...page.prompts.filter((p) => !shown.has(p.id))];
    });
    setNextCursor(page.nextCursor);
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const act = async (prompt: ReportedPrompt, action: "restore" | "delete") => {
    if (
      action === "delete" &&
      !globalThis.confirm(`「${prompt.text}」を削除します。よろしいですか。`)
    ) {
      return;
    }
    setBusy(prompt.id);
    try {
      const id = encodeURIComponent(prompt.id);
      const response =
        action === "restore"
          ? await fetch(`/api/admin/prompt-reports/${id}/restore`, { method: "POST" })
          : await fetch(`/api/admin/prompts/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await readJsonBody(response);
        setError(isApiError(body) ? body.error.message : "更新できませんでした");
        return;
      }
      setError(null);
      // **先頭から読み直さない。** どちらの操作でもこの行はキューから外れ、サーバー側の
      // 件数も同じだけ減るので、手元の一覧から抜くだけでよい（続きの cursor もずれない）
      setPrompts((current) => (current ?? []).filter((p) => p.id !== prompt.id));
      setNextCursor((cursor) => (cursor === null ? null : cursor - 1));
    } catch {
      setError("更新できませんでした");
    } finally {
      // 通信が落ちてもボタンを押せないままにしない
      setBusy(null);
    }
  };

  return (
    <div className="mt-10">
      <p className="text-sm text-kinari/60">
        報告されたお題は、すでに出題から外れています。問題が無ければ復帰、おかしければ削除してください。
      </p>

      {error !== null && <p className="mt-4 text-sm text-shu">{error}</p>}
      {prompts === null && error === null && <p className="mt-10 text-kinari/50">読み込み中</p>}
      {prompts !== null && prompts.length === 0 && (
        <p className="mt-10 text-kinari/50">報告はありません</p>
      )}

      {prompts !== null && prompts.length > 0 && (
        <ul className="mt-4 space-y-3">
          {prompts.map((p) => (
            <li key={p.id} className="rounded-md border border-kinari/15 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-kinari/40">
                <span>{new Date(p.reportedAt * 1000).toLocaleString("ja-JP")}</span>
                <span>
                  {p.reportedBy === null ? "退会済み" : `user:${p.reportedBy.slice(0, 8)}`}
                </span>
                <a
                  href={`/admin/themes/${encodeURIComponent(p.themeId)}`}
                  className="ml-auto font-gothic text-kinari/60 hover:text-kinari"
                >
                  {ADMIN_KIND_LABELS[p.themeKind]}「{p.themeName}」・{formLabel(p.form)}
                </a>
              </div>
              <p className="mt-2 font-mincho text-base text-kinari">{p.text}</p>
              <p className="mt-1 text-xs text-kinari/45">{p.readingKana}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinari/10 pt-3">
                <p className="text-xs text-shu">
                  {p.reportReason === null
                    ? "理由なし"
                    : PROMPT_REPORT_REASON_LABELS[p.reportReason]}
                </p>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void act(p, "restore")}
                  className="ml-auto rounded border border-kin px-4 py-1 text-sm text-kin transition-colors hover:bg-kin/10 disabled:opacity-40"
                >
                  復帰
                </button>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void act(p, "delete")}
                  className="rounded border border-shu/60 px-4 py-1 text-sm text-shu transition-colors hover:bg-shu/10 disabled:opacity-40"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {prompts !== null && nextCursor !== null && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void load(nextCursor)}
            className="rounded border border-kinari/25 px-6 py-1.5 text-sm text-kinari/60 transition-colors hover:border-kin hover:text-kinari"
          >
            さらに読む
          </button>
        </div>
      )}
    </div>
  );
}
