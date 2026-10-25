"use client";

import {
  isApiError,
  PROMPT_REPORT_REASON_LABELS,
  PROMPT_REPORT_REASONS,
  type PromptReportReason,
} from "@henge/shared";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/api/auth-client";
import { readJsonBody } from "@/lib/api/json";

export interface ReportableTextPrompt {
  id: string;
  text: string;
}

/**
 * リザルト画面の「おかしなお題」の報告パネル。
 *
 * 読み違い（`ReportPanel`）ではなく、**文章そのもの**がおかしいお題を報告する。
 * そのプレイで出たお題から選び、理由を付けて POST /api/prompt-reports へ送る。
 * **送ったお題はその場で配信から外れる**（管理者が復帰か削除かを決める）。
 *
 * 匿名で受けると連投でテーマを空にできてしまうので、**報告はログインユーザーのみ**。
 * 未ログインならログインへ案内する。
 */
export function PromptReportPanel({
  prompts,
  open,
  onOpenChange,
}: {
  prompts: ReportableTextPrompt[];
  /** モーダルの開閉は呼び出し側が持つ。開いている間は結果画面のショートカットを止めるため */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState<PromptReportReason | null>(null);
  /** 送信済みのお題。同じ結果画面で二度送らせない */
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  // Esc で閉じる。モーダルが開いている間だけ窓で拾う
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0 || reason === null) return;
    setStatus("sending");
    setProblem(null);
    try {
      const promptIds = [...selected];
      const res = await fetch("/api/prompt-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promptIds, reason }),
      });
      if (res.ok) {
        setSent((current) => new Set([...current, ...promptIds]));
        setSelected(new Set());
        setStatus("done");
      } else {
        const body = await readJsonBody(res);
        if (isApiError(body)) setProblem(body.error.message);
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="rounded-md border border-kinari/20 px-6 py-2 text-sm tracking-widest text-kinari/70 transition-colors hover:border-kin hover:text-kinari"
        >
          おかしなお題を報告する
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-sumi/85 p-4"
          onClick={() => onOpenChange(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="おかしなお題の報告"
            className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-kin/60 bg-sumi p-6 text-left"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs tracking-[0.3em] text-kinari/50">おかしなお題の報告</p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded px-2 py-1 text-sm text-kinari/60 transition-colors hover:text-kinari"
              >
                閉じる
              </button>
            </div>

            {isPending ? null : session === null ? (
              <p className="mt-6 text-center text-sm text-kinari/60">
                ログインするとお題を報告できます。
                <button
                  type="button"
                  onClick={() => authClient.signIn.social({ provider: "google" })}
                  className="ml-2 tracking-widest text-kin underline-offset-4 hover:underline"
                >
                  Googleでログイン
                </button>
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm text-kinari/60">
                  文章がおかしいお題を選んでください。報告したお題はすぐに出題されなくなります。
                  読み仮名の誤りは「読み違いを報告する」から送ってください。
                </p>

                {status === "done" && (
                  <p className="mt-3 text-center text-sm text-kinari">
                    報告を受け付けました。ありがとうございます。
                  </p>
                )}
                {/* 理由が分かっているときはそれだけを出す（汎用の文言と2行並べない） */}
                {problem !== null ? (
                  <p className="mt-3 text-center text-sm text-shu">{problem}</p>
                ) : (
                  status === "error" && (
                    <p className="mt-3 text-center text-sm text-shu">
                      送信に失敗しました。もう一度お試しください。
                    </p>
                  )
                )}

                <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
                  {prompts.map((p, i) => {
                    const done = sent.has(p.id);
                    return (
                      <li key={p.id}>
                        <label
                          className={`flex w-full items-start gap-3 rounded border px-3 py-1.5 text-left text-sm transition-colors ${
                            done
                              ? "border-transparent text-kinari/35"
                              : selected.has(p.id)
                                ? "cursor-pointer border-kin bg-kin/15 text-kinari"
                                : "cursor-pointer border-transparent text-kinari/70 hover:border-kinari/25"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={done || selected.has(p.id)}
                            disabled={done}
                            onChange={() => toggle(p.id)}
                            className="mt-1 accent-kin"
                          />
                          <span className="font-mono text-xs leading-6 text-kinari/40">
                            {i + 1}
                          </span>
                          <span className="flex-1">{p.text}</span>
                          {done && <span className="text-xs text-kinari/40">報告済み</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <fieldset className="mt-4 border-t border-kinari/15 pt-4">
                  <legend className="sr-only">理由</legend>
                  <p className="text-sm text-kinari/60">理由</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PROMPT_REPORT_REASONS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={reason === key}
                        onClick={() => setReason(key)}
                        className={`rounded px-3 py-1.5 text-sm transition-colors ${
                          reason === key
                            ? "border border-kin bg-kin/15 text-kinari"
                            : "border border-kinari/20 text-kinari/70 hover:border-kinari/40"
                        }`}
                      >
                        {PROMPT_REPORT_REASON_LABELS[key]}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={selected.size === 0 || reason === null || status === "sending"}
                    className="rounded-md border border-shu bg-shu/15 px-6 py-2 text-sm tracking-widest text-kinari transition-colors hover:bg-shu/25 disabled:opacity-40"
                  >
                    {status === "sending"
                      ? "送信中…"
                      : selected.size > 0
                        ? `${selected.size}件を報告する`
                        : "報告する"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
