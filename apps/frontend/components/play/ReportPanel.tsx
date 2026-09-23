"use client";

import { useState } from "react";

export interface ReportablePrompt {
  text: string;
  readingKana: string;
}

interface Draft {
  sentenceNo: number;
  promptText: string;
  surface: string;
  reportedKana: string;
  expectedKana: string;
}

const MAX_REPORTS = 15;

/**
 * リザルト画面の読み違い報告パネル。
 *
 * お題一覧からお題を選び、誤読の表層をドラッグ選択（または手入力）して
 * 正しい読みを入力、複数件まとめて POST /api/reading-reports へ送る。
 *
 * ここはタイピング判定領域ではないので通常フォーム（`<input>`）を使う
 * （不変条件7はタイピング判定への input 使用禁止で、報告フォームは対象外）。
 */
export function ReportPanel({
  themeId,
  prompts,
}: {
  themeId: string;
  prompts: ReportablePrompt[];
}) {
  const [open, setOpen] = useState(false);
  const [selNo, setSelNo] = useState<number | null>(null);
  const [surface, setSurface] = useState("");
  const [kana, setKana] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  if (!open) {
    return (
      <div className="mt-10 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-kinari/20 px-6 py-2 text-sm tracking-widest text-kinari/70 transition-colors hover:border-kin hover:text-kinari"
        >
          読み違いを報告する
        </button>
      </div>
    );
  }

  const takeSelection = () => {
    const sel = globalThis.getSelection()?.toString().trim() ?? "";
    if (sel.length > 0 && sel.length <= 30) setSurface(sel);
  };

  const addDraft = () => {
    if (selNo === null || !surface || !kana) return;
    const prompt = prompts[selNo - 1];
    if (prompt === undefined) return;
    setDrafts([
      ...drafts,
      {
        sentenceNo: selNo,
        promptText: prompt.text,
        surface,
        reportedKana: prompt.readingKana,
        expectedKana: kana,
      },
    ]);
    setSurface("");
    setKana("");
  };

  const submit = async () => {
    if (drafts.length === 0) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/reading-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reports: drafts.slice(0, MAX_REPORTS).map((d) => ({
            themeId,
            sentenceNo: d.sentenceNo,
            promptText: d.promptText,
            surface: d.surface,
            reportedKana: d.reportedKana,
            expectedKana: d.expectedKana,
          })),
        }),
      });
      setStatus(res.ok ? "done" : "error");
      if (res.ok) setDrafts([]);
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="mt-10 rounded-md border border-kinari/15 bg-kinari/5 p-5 text-left">
      <p className="text-center text-xs tracking-[0.3em] text-kinari/50">読み違いの報告</p>

      {status === "done" && (
        <p className="mt-3 text-center text-sm text-kinari">
          報告を受け付けました。ありがとうございます。
        </p>
      )}
      {status === "error" && (
        <p className="mt-3 text-center text-sm text-shu">
          送信に失敗しました���もう一度お試しください。
        </p>
      )}

      {/* そのプレイで出題されたお題一覧 */}
      <ol className="mt-4 max-h-48 space-y-1 overflow-y-auto">
        {prompts.map((p, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => setSelNo(i + 1)}
              className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                selNo === i + 1
                  ? "border border-kin bg-kin/15 text-kinari"
                  : "border border-transparent text-kinari/70 hover:border-kinari/25"
              }`}
            >
              <span className="mr-2 font-mono text-xs text-kinari/40">{i + 1}</span>
              {p.text}
            </button>
          </li>
        ))}
      </ol>

      {selNo !== null && (
        <div className="mt-4 border-t border-kinari/15 pt-4">
          <p className="text-sm text-kinari/60">
            誤っている部分をドラッグで選択するか、表層を入力してください
          </p>
          <p
            className="mt-2 select-text rounded border border-kinari/15 bg-kinari/5 px-3 py-2 text-base leading-relaxed text-kinari"
            onMouseUp={takeSelection}
          >
            {prompts[selNo - 1]?.text}
          </p>
          <p className="mt-1 font-mono text-xs text-kinari/45">
            生成された読み: {prompts[selNo - 1]?.readingKana}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="text"
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              placeholder="誤った表層（例: かき氷）"
              maxLength={30}
              className="rounded border border-kinari/25 bg-transparent px-3 py-2 text-sm text-kinari placeholder:text-kinari/30"
            />
            <input
              type="text"
              value={kana}
              onChange={(e) => setKana(e.target.value)}
              placeholder="正しい読み（例: かきごおり）"
              maxLength={60}
              className="rounded border border-kinari/25 bg-transparent px-3 py-2 text-sm text-kinari placeholder:text-kinari/30"
            />
            <button
              type="button"
              onClick={addDraft}
              disabled={!surface || !kana || drafts.length >= MAX_REPORTS}
              className="rounded border border-kin px-4 py-2 text-sm text-kin transition-colors hover:bg-kin/10 disabled:opacity-30"
            >
              追加
            </button>
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <div className="mt-4 border-t border-kinari/15 pt-3">
          <ul className="space-y-1">
            {drafts.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-kinari/80">
                <span className="font-mono text-xs text-kinari/40">#{d.sentenceNo}</span>
                <span className="text-kinari">{d.surface}</span>
                <span className="text-kinari/50">→</span>
                <span className="text-kinari">{d.expectedKana}</span>
                <button
                  type="button"
                  onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                  className="ml-auto text-xs text-kinari/40 hover:text-shu"
                >
                  消す
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={submit}
              disabled={status === "sending"}
              className="rounded-md border border-shu bg-shu/15 px-6 py-2 text-sm tracking-widest text-kinari transition-colors hover:bg-shu/25 disabled:opacity-40"
            >
              {status === "sending" ? "送信中…" : `${drafts.length}件を報告する`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
