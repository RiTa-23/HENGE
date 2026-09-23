"use client";

import { isApiError } from "@henge/shared";
import { useCallback, useEffect, useState } from "react";

interface AdminReport {
  id: string;
  themeId: string;
  sentenceNo: number;
  promptText: string;
  surface: string;
  reportedKana: string;
  expectedKana: string;
  userId: string | null;
  status: "pending" | "approved" | "rejected" | "applied";
  cost: number | null;
  createdAt: string;
}

type Status = AdminReport["status"];

const STATUSES: { key: Status; label: string }[] = [
  { key: "pending", label: "承認待ち" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "却下" },
  { key: "applied", label: "適用済み" },
];

/** コストの既定選択肢。案2のBUILD.mdの基準に合わせる */
const COST_CHOICES = [
  { value: "-20000", label: "熟語・常勝（-20000）" },
  { value: "3000", label: "単漢字・語幹（3000）" },
  { value: "", label: "自動推定に任せる" },
];

const KATAKANA_RE = /^[ァ-ヶー]+$/;

function toKatakana(kana: string): string {
  return kana.replace(/[ぁ-ん]/g, (c) => String.fromCodePoint(c.codePointAt(0)! + 0x60));
}

/**
 * 読み違い報告の承認キュー。
 *
 * 承認は「user-lex.csv の行になり得るか」の審査: expected_kana はかなに
 * 正規化してから渡す。コストは報告者が決められないので管理者が
 * 「熟語か/単漢字・語幹か」で選ぶ（既定は自動推定、案2の掃引スクリプトに委ねる）。
 */
export function AdminReportList() {
  const [status, setStatus] = useState<Status>("pending");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 承認時に確認する読み・コストを報告ごとに保持
  const [edits, setEdits] = useState<Record<string, { kana: string; cost: string }>>({});

  const load = useCallback(async (s: Status) => {
    const response = await fetch(`/api/admin/reading-reports?status=${s}&limit=100`);
    const body: unknown = await response.json();
    if (!response.ok) {
      setError(isApiError(body) ? body.error.message : "一覧を取得できませんでした");
      return;
    }
    setReports((body as { reports: AdminReport[] }).reports);
    setEdits({});
  }, []);

  useEffect(() => {
    setReports(null);
    setError(null);
    void load(status);
  }, [status, load]);

  const act = async (
    report: AdminReport,
    action: "approve" | "reject",
    kana?: string,
    cost?: string,
  ) => {
    setBusy(report.id);
    const response = await fetch("/api/admin/reading-reports", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: report.id,
        action,
        ...(kana ? { expectedKana: kana } : {}),
        ...(cost ? { cost: Number(cost) } : {}),
      }),
    });
    setBusy(null);
    if (!response.ok) {
      const body: unknown = await response.json();
      setError(isApiError(body) ? body.error.message : "更新できませんでした");
      return;
    }
    await load(status);
  };

  const approve = (report: AdminReport) => {
    const e = edits[report.id];
    const kana = toKatakana((e?.kana ?? report.expectedKana).trim());
    if (!KATAKANA_RE.test(kana)) {
      setError("読みはカタカ���で入力してください");
      return;
    }
    setError(null);
    void act(report, "approve", kana, e?.cost ?? "");
  };

  return (
    <div className="mt-10">
      <div className="flex gap-2 border-b border-kinari/15 pb-4">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatus(s.key)}
            className={`rounded px-4 py-1.5 text-sm tracking-widest transition-colors ${
              status === s.key
                ? "border border-kin bg-kin/15 text-kinari"
                : "border border-transparent text-kinari/50 hover:text-kinari"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error !== null && <p className="mt-4 text-sm text-shu">{error}</p>}
      {reports === null && <p className="mt-10 text-kinari/50">読み込み中</p>}
      {reports !== null && reports.length === 0 && (
        <p className="mt-10 text-kinari/50">報告はありません</p>
      )}

      {reports !== null && reports.length > 0 && (
        <ul className="mt-4 space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-md border border-kinari/15 p-4 text-sm">
              <div className="flex items-center gap-2 font-mono text-xs text-kinari/40">
                <span>{new Date(r.createdAt).toLocaleString("ja-JP")}</span>
                <span>{r.userId === null ? "匿名" : `user:${r.userId.slice(0, 8)}`}</span>
                <span className="ml-auto">
                  {r.themeId.slice(0, 8)}・文 {r.sentenceNo}
                </span>
              </div>
              <p className="mt-2 text-kinari/90">{r.promptText}</p>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-kinari/45">表層</dt>
                  <dd className="font-medium text-kinari">{r.surface}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-kinari/45">生成された読み</dt>
                  <dd className="font-mono text-shu">{r.reportedKana}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-kinari/45">正しい読み</dt>
                  <dd className="font-mono text-kinari">{r.expectedKana}</dd>
                </div>
              </dl>

              {r.status === "pending" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinari/10 pt-3">
                  <input
                    type="text"
                    defaultValue={r.expectedKana}
                    onChange={(e) =>
                      setEdits({
                        ...edits,
                        [r.id]: { kana: e.target.value, cost: edits[r.id]?.cost ?? "" },
                      })
                    }
                    maxLength={60}
                    className="min-w-40 flex-1 rounded border border-kinari/25 bg-transparent px-2 py-1 font-mono text-sm text-kinari"
                    aria-label="正しい読み（カタカナに正規化して登録）"
                  />
                  <select
                    value={edits[r.id]?.cost ?? ""}
                    onChange={(e) =>
                      setEdits({
                        ...edits,
                        [r.id]: { kana: edits[r.id]?.kana ?? r.expectedKana, cost: e.target.value },
                      })
                    }
                    className="rounded border border-kinari/25 bg-transparent px-2 py-1 text-xs text-kinari/80"
                  >
                    {COST_CHOICES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => approve(r)}
                    className="rounded border border-kin px-4 py-1 text-sm text-kin transition-colors hover:bg-kin/10 disabled:opacity-40"
                  >
                    承認
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void act(r, "reject")}
                    className="rounded border border-kinari/25 px-4 py-1 text-sm text-kinari/60 transition-colors hover:border-shu hover:text-shu disabled:opacity-40"
                  >
                    却下
                  </button>
                </div>
              )}
              {r.status === "approved" && (
                <p className="mt-2 text-xs text-kinari/50">
                  cost: {r.cost === null ? "自動推定" : r.cost}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
