"use client";

import { isApiError, type PlayStats, type PromptForm, RANKING_SIZE } from "@henge/shared";
import { useState } from "react";
import { authClient } from "@/lib/api/auth-client";
import { readJsonBody } from "@/lib/api/json";

interface Registered {
  score: number;
  best: boolean;
  rank: number | null;
}

/**
 * 結果画面の「ランキングに登録」。
 *
 * 送るのは**生の値**（打鍵数・ミス・時間）で、スコアはサーバーで計算する
 * （画面のスコアと同じ関数。`packages/shared/src/score.ts`）。
 *
 * 登録できるのはログイン済みで**ユーザー名を決めた**人だけ。プレイ画面には
 * `SiteHeader` が無く、名前未設定のままここまで来られるので、その場合はマイページへ
 * 案内する（`DisplayNameGate` はヘッダーのある画面でしか出ない）。
 *
 * 1人1件（ベスト）なので、押した結果は「N位に入った」「ベストを超えなかった」
 * 「100位以内に届かなかった」のどれかになる。結果画面は「もう一度」で作り直される
 * ので、状態はこの部品の寿命（1回の結果）に閉じる。
 */
export function RankingRegister({
  themeId,
  form,
  stats,
  rankingHref,
}: {
  themeId: string;
  form: PromptForm;
  stats: PlayStats;
  /** 詳細ページのランキング（登録後に見に行く先） */
  rankingHref: string;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<Registered | null>(null);

  if (isPending) return null;

  const wrap = "mt-10 rounded-md border border-kinari/15 bg-kinari/5 px-6 py-5 text-center";
  const note = "text-sm text-kinari/60";
  const link = "ml-2 tracking-widest text-kin hover:underline underline-offset-4";

  if (session === null) {
    return (
      <div className={wrap}>
        <p className={note}>
          ログインするとランキングに登録できます。
          <button
            type="button"
            onClick={() => authClient.signIn.social({ provider: "google" })}
            className={link}
          >
            Googleでログイン
          </button>
        </p>
      </div>
    );
  }

  if (!session.user.displayName) {
    return (
      <div className={wrap}>
        <p className={note}>
          ユーザー名を決めるとランキングに登録できます。
          <a href="/me" className={link}>
            マイページで決める →
          </a>
        </p>
      </div>
    );
  }

  const register = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, form, ...stats }),
    });
    // 本文が空（サーバー側の例外など）でも落とさない。エラーを出そうとして別の例外で
    // 結果画面ごと消えるのが最悪の壊れ方
    const body = await readJsonBody(response);
    setBusy(false);
    if (!response.ok) {
      setError(isApiError(body) ? body.error.message : "登録できませんでした");
      return;
    }
    setRegistered(body as Registered);
  };

  if (registered !== null) {
    const { best, rank } = registered;
    const message =
      best && rank !== null
        ? `${rank}位に入りました`
        : best
          ? `ベストを更新しましたが、${RANKING_SIZE}位以内には届きませんでした`
          : rank !== null
            ? `これまでのベスト（${rank}位）を超えませんでした`
            : "これまでのベストを超えませんでした";
    return (
      <div className={wrap}>
        <p role="status" className="tracking-widest text-kinari">
          {message}
          <a href={rankingHref} className={link}>
            ランキングを見る →
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <button
        type="button"
        onClick={() => void register()}
        disabled={busy}
        className="rounded-md border border-kin/60 px-8 py-2.5 font-gothic tracking-widest text-kin transition-colors hover:bg-kin/10 disabled:border-kinari/15 disabled:text-kinari/30 disabled:hover:bg-transparent"
      >
        {busy ? "登録中" : "ランキングに登録"}
      </button>
      <p className="mt-3 text-xs text-kinari/50">
        「{session.user.displayName}」の名前で、このお題のベストスコアとして登録します。
      </p>
      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-kinari">
          {error}
        </p>
      )}
    </div>
  );
}
