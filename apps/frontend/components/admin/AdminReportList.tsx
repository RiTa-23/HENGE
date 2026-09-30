"use client";

import { hiraganaToKatakana, isApiError } from "@henge/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonBody } from "@/lib/api/json";

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
  createdAt: number;
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

/** 1回に読む件数。これより多いときは「さらに読む」で続きを引く */
const PAGE_SIZE = 50;

/**
 * 1字だけの表層か。**承認すると、その字を含む熟語の読みまで変えやすい**
 * （実例: 田→タ で 水田→みずた・田舎→たしゃ、向→ム で 方向→かたむ）。
 */
function isSingleChar(surface: string): boolean {
  return [...surface].length === 1;
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
  /** 続きがありそうか（直前のページが満杯だったか） */
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 承認時に確認する読み・コストを報告ごとに保持
  const [edits, setEdits] = useState<Record<string, { kana: string; cost: string }>>({});
  /**
   * 最後に出した一覧の要求の番号。**タブを素早く切り替えたとき、前のタブの応答で
   * 一覧を上書きしない**ために、返ってきた応答が最新の要求のものかを見る
   */
  const latestRequest = useRef(0);

  /** 先頭から読み直す（cursor=0）か、続きを足す（cursor=いまの件数） */
  const load = useCallback(async (s: Status, cursor: number) => {
    const request = ++latestRequest.current;
    const response = await fetch(
      `/api/admin/reading-reports?status=${s}&limit=${PAGE_SIZE}&cursor=${cursor}`,
    );
    const body = await readJsonBody(response);
    if (request !== latestRequest.current) return;
    if (!response.ok) {
      setError(isApiError(body) ? body.error.message : "一覧を取得できませんでした");
      return;
    }
    const page = (body as { reports: AdminReport[] }).reports;
    setReports((current) => {
      if (cursor === 0) return page;
      // オフセット方式なので、読むあいだに報告が増えると前のページの末尾がもう一度来る。
      // 同じ id を2度並べない（key が重複する）
      const shown = new Set((current ?? []).map((report) => report.id));
      return [...(current ?? []), ...page.filter((report) => !shown.has(report.id))];
    });
    setHasMore(page.length === PAGE_SIZE);
    if (cursor === 0) setEdits({});
  }, []);

  useEffect(() => {
    setReports(null);
    setError(null);
    void load(status, 0);
  }, [status, load]);

  const act = async (
    report: AdminReport,
    action: "approve" | "reject" | "reopen" | "edit",
    kana?: string,
    cost?: string,
  ) => {
    setBusy(report.id);
    try {
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
      if (!response.ok) {
        const body = await readJsonBody(response);
        setError(isApiError(body) ? body.error.message : "更新できませんでした");
        return;
      }
      setError(null);
      // **先頭から読み直さない。** 「さらに読む」で開いた2ページ目以降で操作するたびに
      // 一覧が先頭の50件に縮んで位置がずれる。結果は手元の一覧に写す:
      // 状態が変わる操作はいまのタブから外れる。サーバー側でもこのタブの件数が同じだけ
      // 減るので、続きの cursor（=手元の件数）はずれない。edit は読みだけ差し替える
      if (action === "edit" && kana !== undefined) {
        setReports((current) =>
          (current ?? []).map((r) =>
            r.id === report.id ? Object.assign({}, r, { expectedKana: kana }) : r,
          ),
        );
      } else {
        setReports((current) => (current ?? []).filter((r) => r.id !== report.id));
      }
      setEdits(({ [report.id]: _done, ...rest }) => rest);
    } catch {
      setError("更新できませんでした");
    } finally {
      // 通信が落ちてもボタンを押せないままにしない
      setBusy(null);
    }
  };

  /** 入力された読みを検証してから action に流す。edit と approve で共用 */
  const withKana = (report: AdminReport, fn: (kana: string) => void) => {
    const e = edits[report.id];
    // 保存はサーバーがカタカナに揃える。ここで揃えるのは入力の検査のため
    const kana = hiraganaToKatakana((e?.kana ?? report.expectedKana).trim());
    if (!KATAKANA_RE.test(kana)) {
      setError("読みはカタカナで入力してください");
      return;
    }
    setError(null);
    fn(kana);
  };

  const approve = (report: AdminReport) =>
    withKana(report, (kana) => void act(report, "approve", kana, edits[report.id]?.cost ?? ""));

  const saveKana = (report: AdminReport) =>
    withKana(report, (kana) => void act(report, "edit", kana));

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
                <span>{new Date(r.createdAt * 1000).toLocaleString("ja-JP")}</span>
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

              {r.status === "pending" && isSingleChar(r.surface) && (
                <p className="mt-2 text-xs text-shu">
                  1字だけの表層です。承認すると、この字を含む熟語の読みまで変わることがあります
                  （例: 田→タ で 水田→みずた）。前後を含めた表層で直せないか確かめてください。
                </p>
              )}
              {r.status === "pending" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinari/10 pt-3">
                  <input
                    type="text"
                    defaultValue={r.expectedKana}
                    onChange={(e) => {
                      const kana = e.target.value;
                      setEdits((current) => ({
                        ...current,
                        [r.id]: { kana, cost: current[r.id]?.cost ?? "" },
                      }));
                    }}
                    maxLength={60}
                    className="min-w-40 flex-1 rounded border border-kinari/25 bg-transparent px-2 py-1 font-mono text-sm text-kinari"
                    aria-label="正しい読み（カタカナに正規化して登録）"
                  />
                  <select
                    value={edits[r.id]?.cost ?? ""}
                    onChange={(e) => {
                      const cost = e.target.value;
                      setEdits((current) => ({
                        ...current,
                        [r.id]: { kana: current[r.id]?.kana ?? r.expectedKana, cost },
                      }));
                    }}
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
                    onClick={() => saveKana(r)}
                    className="rounded border border-kinari/25 px-4 py-1 text-sm text-kinari/60 transition-colors hover:border-kin hover:text-kinari disabled:opacity-40"
                  >
                    読みを保存
                  </button>
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
                <div className="mt-3 flex items-center gap-2 border-t border-kinari/10 pt-3">
                  <p className="text-xs text-kinari/50">
                    cost: {r.cost === null ? "自動推定" : r.cost}
                  </p>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void act(r, "reopen")}
                    className="ml-auto rounded border border-kinari/25 px-4 py-1 text-sm text-kinari/60 transition-colors hover:border-kin hover:text-kinari disabled:opacity-40"
                  >
                    承認待ちに戻す
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
              {r.status === "rejected" && (
                <div className="mt-3 flex justify-end border-t border-kinari/10 pt-3">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void act(r, "reopen")}
                    className="rounded border border-kinari/25 px-4 py-1 text-sm text-kinari/60 transition-colors hover:border-kin hover:text-kinari disabled:opacity-40"
                  >
                    承認待ちに戻す
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {reports !== null && hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void load(status, reports.length)}
            className="rounded border border-kinari/25 px-6 py-1.5 text-sm text-kinari/60 transition-colors hover:border-kin hover:text-kinari"
          >
            さらに読む
          </button>
        </div>
      )}
    </div>
  );
}
