"use client";

import { isApiError, type PlayLog, type PromptForm, RANKING_SIZE } from "@henge/shared";
import { type ReactNode, useState } from "react";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { authClient } from "@/lib/api/auth-client";
import { readJsonBody } from "@/lib/api/json";
import { savePendingRanking } from "@/lib/play/pending-ranking";

interface Registered {
  score: number;
  best: boolean;
  rank: number | null;
}

/**
 * 結果画面の「ランキングに登録」。
 *
 * 送るのは**プレイチケットと打鍵ログ**で、打鍵数・ミス・時間もスコアも送らない。
 * サーバーがチケットのお題で打鍵ログを再生して記録を出し、スコアを計算する
 * （画面と同じ打鍵エンジンと同じ関数。`docs/04-api.md`）。
 *
 * 登録できるのはログイン済みで**ユーザー名を決めた**人だけ。
 *
 * - **未ログインなら、記録を sessionStorage に退避してからログインする**
 *   （`lib/play/pending-ranking.ts`）。結果は React の状態にしか無く、OAuth の
 *   リダイレクトで消えるため。戻り先はこのプレイ画面で、開始前に
 *   「ログイン前の記録」として出す（`PendingRankingRegister`）
 * - **ユーザー名が未設定なら、その場で決める**（`DisplayNameForm`）。プレイ画面には
 *   `SiteHeader` が無く `DisplayNameGate` が出ない。マイページへ遷移させると、
 *   戻ってくる導線が無くなる
 *
 * 1人1件（ベスト）なので、押した結果は「N位に入った」「ベストを超えなかった」
 * 「100位以内に届かなかった」のどれかになる。結果画面は「もう一度」で作り直される
 * ので、状態はこの部品の寿命（1回の結果）に閉じる。
 */
export function RankingRegister({
  themeId,
  form,
  score,
  ticket,
  playLog,
  rankingHref,
  lead,
  onSettled,
}: {
  /** ログインのために退避するときの、どのプールの記録か */
  themeId: string;
  form: PromptForm;
  /** 結果画面のスコア。退避した記録を出すときに見せる（登録の値はサーバーが出す） */
  score: number;
  /** プレイチケット。サーバーに署名鍵が無ければ null で、登録できない */
  ticket: string | null;
  playLog: PlayLog;
  /** 詳細ページのランキング（登録後に見に行く先） */
  rankingHref: string;
  /** 枠の先頭に出す一言（「ログイン前の記録」など） */
  lead?: ReactNode;
  /**
   * 登録の結果が出たとき（通った・断られた）に呼ぶ。連打で弾かれた（429）ときは
   * 呼ばない。退避した記録を消すのに使う（同じ記録は2度と通らないので出し続けない）
   */
  onSettled?: () => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<Registered | null>(null);

  if (isPending) return null;

  const wrap =
    "mt-10 rounded-md border border-kinari/15 bg-kinari/5 px-6 py-5 text-center short:mt-6 short:py-4";
  const note = "text-sm text-kinari/60";
  const link = "ml-2 tracking-widest text-kin hover:underline underline-offset-4";

  const leading = lead === undefined ? null : <div className="mb-4">{lead}</div>;

  if (ticket === null) {
    return (
      <div className={wrap}>
        <p className={note}>この記録はランキングに登録できません。</p>
      </div>
    );
  }

  if (session === null) {
    const login = () => {
      // **ログインの前に退避する。** 戻ってきたプレイ画面で登録できるようにするため
      savePendingRanking({ themeId, form, ticket, log: playLog, score, savedAt: Date.now() });
      void authClient.signIn.social({
        provider: "google",
        callbackURL: `${location.pathname}${location.search}`,
      });
    };
    return (
      <div className={wrap}>
        {leading}
        <p className={note}>
          ログインすると、この記録をランキングに登録できます。
          <button type="button" onClick={login} className={link}>
            Googleでログイン
          </button>
        </p>
      </div>
    );
  }

  if (!session.user.displayName) {
    // 保存するとセッションが取り直され、名前が入ったこの部品が登録ボタンで描き直される
    return (
      <div className={`${wrap} text-left`}>
        {leading}
        <p className={`${note} mb-4`}>ランキングに出す名前を決めると、登録できます。</p>
        <DisplayNameForm initialName="" submitLabel="名前を決める" />
      </div>
    );
  }

  const register = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, log: playLog }),
    });
    // 本文が空（サーバー側の例外など）でも落とさない。エラーを出そうとして別の例外で
    // 結果画面ごと消えるのが最悪の壊れ方
    const body = await readJsonBody(response);
    setBusy(false);
    if (response.status !== 429) onSettled?.();
    if (!response.ok) {
      setError(isApiError(body) ? body.error.message : "登録できませんでした");
      return;
    }
    setRegistered(body as Registered);
  };

  if (registered !== null) {
    const { best, rank } = registered;
    // **圏外の記録は保存されない**（上位100件だけを保持し、書いた直後に刈り込まれる）。
    // 「ベストを更新した」と言うと、次に低いスコアでも同じ文言が出て嘘になる
    const message =
      best && rank !== null
        ? `${rank}位に入りました`
        : best
          ? `${RANKING_SIZE}位以内に入らなかったため、記録は残りません`
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
      {leading}
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
