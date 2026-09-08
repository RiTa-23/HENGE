"use client";

import {
  isApiError,
  isImeKey,
  normalizeTypedKey,
  PLAY_SIZE,
  pressKey,
  type RomanCandidates,
  romanDisplay,
  splitKanaUnits,
  startTyping,
  type ThemeKind,
  type TypingProgress,
} from "@henge/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { authClient } from "@/lib/api/auth-client";
import { Keyboard, type NextKey, toNextKey } from "./Keyboard";
import { Loading } from "./Loading";
import { ProgressDots } from "./ProgressDots";
import { Result, type PlayStats } from "./Result";
import { Scroll } from "./Scroll";
import { readOffset, writeOffset } from "@/lib/play/offset";
import { mergeMissedKeys } from "@/lib/play/misses";
import { kindLabel, listHref } from "@/lib/ui/kind";

interface Prompt {
  id: string;
  text: string;
  readingKana: string;
  readingRoman: RomanCandidates;
}

interface SessionResponse {
  prompts: Prompt[];
  nextOffset: number;
  remainingInPool: number;
  quotaRemaining?: number;
}

type Phase =
  /** 開始前。**ここではまだ在庫を消費しない** */
  | { name: "ready" }
  | { name: "loading" }
  /** 在庫が足りず生成中。エラーではなく待ち */
  | { name: "preparing" }
  | { name: "error"; code: string; message: string }
  | { name: "playing"; session: SessionResponse }
  | { name: "result"; session: SessionResponse };

/** 生成中のときに引き直す間隔と、諦めるまでの上限 */
const RETRY_INTERVAL_MS = 3_000;
const MAX_WAIT_MS = 90_000;

/** 次に打てるキー。候補それぞれの「いま打つべき1文字」を集める */
function nextKeysOf(progress: TypingProgress): NextKey[] {
  const letters = new Set(
    progress.matches
      .map((candidate) => candidate[progress.input.length])
      .filter((letter): letter is string => letter !== undefined),
  );
  return [...letters].map((letter) => toNextKey(letter));
}

/**
 * 打鍵として扱うキーか。
 *
 * ここで見るのは修飾キーだけ。**どの文字を打鍵として受けるかは
 * `normalizeTypedKey`（packages/shared）に任せる。** Shift は `！` `？` の
 * 入力に要るので許す。
 */
function isTypingKey(event: KeyboardEvent): boolean {
  return !(event.ctrlKey || event.metaKey || event.altKey);
}

/**
 * 打鍵の画面。**テーマモードと最適化モードで分けない。**
 * 違うのは離脱先の一覧と、画面に出す呼び名（「このテーマ」／「この音」）だけ。
 */
export function PlayScreen({
  themeId,
  themeName,
  kind,
  shareUrl,
  beta = false,
}: {
  themeId: string;
  themeName: string;
  kind: ThemeKind;
  /** 結果のX投稿で共有するURL（着地ページの絶対URL）。サーバー側で組み立てて渡す */
  shareUrl: string;
  /** ベータ運用の間だけロゴの横に「ベータ版」を出す。判定はサーバー側（lib/beta/beta.ts） */
  beta?: boolean;
}) {
  const { data: authSession } = authClient.useSession();
  const backToList = listHref(kind);
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const [promptIndex, setPromptIndex] = useState(0);
  const [progress, setProgress] = useState<TypingProgress>(() => startTyping([]));
  const [stats, setStats] = useState<PlayStats>({ hits: 0, misses: 0, elapsedMs: 0 });
  /** 15問を通した苦手キー。問題ごとの集計をここへ畳む */
  const [missedKeys, setMissedKeys] = useState<ReadonlyMap<string, number>>(() => new Map());
  /**
   * 日本語入力のまま打たれたことがあるか。**一度でも見たら出しっぱなしにする。**
   * 打つたびに出たり消えたりすると、打鍵に気を取られて読めない
   */
  const [imeDetected, setImeDetected] = useState(false);
  const startedAt = useRef<number>(0);
  const surface = useRef<HTMLDivElement>(null);
  // 生成中の待ち。attempt を増やすと load が走り直す
  const [attempt, setAttempt] = useState(0);
  const waitingSince = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 1問目から打ち始める。取得直後と、中断からの再開の両方で使う */
  const beginPlay = (session: SessionResponse) => {
    setPromptIndex(0);
    setStats({ hits: 0, misses: 0, elapsedMs: 0 });
    setMissedKeys(new Map());
    startedAt.current = performance.now();
    setProgress(startTyping(session.prompts[0]?.readingRoman ?? []));
    setPhase({ name: "playing", session });
  };

  /**
   * 途中でやめて開始前へ戻る。**取得済みのお題は捨てる。**
   *
   * 持ち回して再開できるようにすると、**一度お題を見たうえで同じ15問を打ち直せて
   * しまう。** 暗記による有利を作らないことがこのサービスの前提なので、見たお題を
   * 再配布しない。オフセットは受け取った時点で消費が確定している（docs/04-api.md）
   * ため、やめた分の在庫は戻らない。それは中断の代償として受け入れる。
   */
  const quit = () => {
    setPhase((current) => (current.name === "playing" ? { name: "ready" } : current));
  };

  const load = useCallback(async () => {
    setPhase({ name: "loading" });
    const response = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ログイン中はサーバーが進捗を持つので offset は無視される。
      // 匿名のときだけこの値が使われる
      body: JSON.stringify({ themeId, offset: readOffset(themeId) }),
    });
    const body: unknown = await response.json();

    if (!response.ok) {
      const { code, message } = isApiError(body)
        ? body.error
        : { code: "UNKNOWN", message: "お題を取得できませんでした" };

      // **「生成中」はエラーではなく待ち。** 手裏剣を回したまま数秒後に引き直す。
      // 「少し待ってからもう一度」と出して操作を押し付けるのは、待てば解決する
      // ことが分かっている状況ではただの手間になる
      if (code === "GENERATION_IN_PROGRESS") {
        const since = waitingSince.current ?? Date.now();
        waitingSince.current = since;
        if (Date.now() - since < MAX_WAIT_MS) {
          setPhase({ name: "preparing" });
          retryTimer.current = setTimeout(
            () => setAttempt((count) => count + 1),
            RETRY_INTERVAL_MS,
          );
          return;
        }
      }

      waitingSince.current = null;
      setPhase({ name: "error", code, message });
      return;
    }

    waitingSince.current = null;

    const session = body as SessionResponse;
    // **返された時点で消費が確定する。** 中断しても巻き戻さない
    writeOffset(themeId, session.nextOffset);
    beginPlay(session);
  }, [themeId]);

  // **開始するまで sessions/start を呼ばない。** 呼んだ時点でオフセットの消費が
  // 確定し、条件次第では背景補充も走る（＝クォータを1消費する）。画面を開いた
  // だけでそれが起きるのは、利用者から見て身に覚えのない消費になる
  useEffect(() => {
    if (attempt > 0) void load();
  }, [load, attempt]);

  // 待ち直しの予約を残したまま画面を離れない
  useEffect(() => {
    return () => {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, []);

  // 打鍵を拾う要素にフォーカスを当て続ける。外れると1打も拾えなくなる
  useEffect(() => {
    if (phase.name === "playing") surface.current?.focus();
  }, [phase.name]);

  const start = () => setAttempt((count) => count + 1);

  /**
   * 開始前のスペースは**画面全体で拾う**。
   *
   * フォーカスを当てた要素の keydown で拾うと、blur のたびに当て直すことになり、
   * 同じ画面にある「一覧に戻る」へキーボードで到達できなくなる。開始前は打鍵を
   * 1打も取りこぼさない必要が無いので、窓側で受けてフォーカスを自由にする。
   */
  useEffect(() => {
    if (phase.name !== "ready") return;
    const onKey = (event: KeyboardEvent) => {
      // key と code の両方を見る。配列やIMEの状態によって key が空になることがある
      if (event.key !== " " && event.code !== "Space") return;
      // スペースでの画面スクロールを止める
      event.preventDefault();
      setAttempt((count) => count + 1);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [phase.name]);

  /**
   * 枯渇からの復帰。**ログインユーザーだけが使える**（クォータを1消費する）。
   * 匿名は別テーマかログインへ誘導する（docs/04-api.md）。
   *
   * 自動では走らせない。クォータを消費する行為なので、本人が選んだときだけ動かす。
   */
  const regenerate = async () => {
    setPhase({ name: "preparing" });
    const response = await fetch("/api/prompts/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId }),
    });

    if (response.ok) {
      // 積み上がった在庫で引き直す
      waitingSince.current = null;
      setAttempt((count) => count + 1);
      return;
    }

    const body: unknown = await response.json();
    const { code, message } = isApiError(body)
      ? body.error
      : { code: "UNKNOWN", message: "お題を作れませんでした" };
    setPhase({ name: "error", code, message });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (phase.name !== "playing") return;

    // **Esc は打鍵より先に見る。** normalizeTypedKey は打てない文字として捨てるので、
    // ここで拾わないと画面のボタンからしかやめられない
    if (event.key === "Escape") {
      event.preventDefault();
      quit();
      return;
    }

    if (!isTypingKey(event.nativeEvent)) return;

    // **`event.key` をそのまま渡さない。** 候補テーブルは小文字のASCIIしか持たないため、
    // Caps Lock の `"S"` や、かなで届いた `"し"` は**すべてミスとして数えられてしまう**。
    // 「正しく打っているのに一文字も進まない」という、画面から原因の見えない壊れ方になる
    const typed = normalizeTypedKey(event.key);
    if (typed === null) {
      // 打鍵として解釈できないものは**ミスに数えない**。原因が分かるものだけ画面で伝える
      if (isImeKey(event.key)) {
        event.preventDefault();
        setImeDetected(true);
      }
      return;
    }
    event.preventDefault();

    const next = pressKey(progress, typed);
    if (!next.finished) {
      setProgress(next);
      return;
    }

    // 1問終わり。統計を畳んでから次の問題へ
    const hits = stats.hits + next.hitCount;
    const misses = stats.misses + next.missCount;
    const upcoming = promptIndex + 1;
    // missedKeys は問題ごとに作り直されるので、ここで通算へ足す
    setMissedKeys((total) => mergeMissedKeys(total, next.missedKeys));

    if (upcoming >= phase.session.prompts.length) {
      setStats({ hits, misses, elapsedMs: performance.now() - startedAt.current });
      setPhase({ name: "result", session: phase.session });
      return;
    }

    setStats({ hits, misses, elapsedMs: 0 });
    setPromptIndex(upcoming);
    // 撒菱は次の問題で消える（新しい TypingProgress を作り直すため）
    setProgress(startTyping(phase.session.prompts[upcoming]?.readingRoman ?? []));
  };

  if (phase.name === "ready") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-kin/60 bg-kinari/5 px-10 py-16 text-center">
          {/* 開始前に出すのはテーマ名だけ。総数を出しても遊べる残り数とは違ううえ、
              15問ひと組は例外なく成り立つので添えても情報が増えない */}
          <h1 className="font-mincho text-4xl leading-snug tracking-wider text-kinari">
            {themeName}
          </h1>

          <p className="mt-14 flex items-center justify-center gap-3 text-kinari">
            <span className="rounded-md border border-shu bg-shu/20 px-10 py-2 font-mono text-sm tracking-widest shadow-[0_0_10px_var(--color-shu)]">
              Space
            </span>
            <span className="tracking-widest">で開始</span>
          </p>
          <p className="mt-4 text-xs leading-relaxed text-kinari/40">
            押すまでお題は消費されません。
          </p>

          <div className="mt-12 flex justify-center">
            <a
              href={backToList}
              className="rounded-md border border-kinari/20 px-8 py-2.5 tracking-widest text-kinari/80 transition-colors hover:border-kin hover:text-kinari"
            >
              一覧に戻る
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === "loading") {
    return <Loading message="お題を用意しています" note="生成が要る場合は十数秒かかります。" />;
  }

  if (phase.name === "preparing") {
    return (
      <Loading
        message="お題を作っています"
        note="できあがり次第そのまま始まります。閉じずにお待ちください。"
      />
    );
  }

  if (phase.name === "error") {
    // 枯渇はログインしていれば作り足して続けられる。匿名は別テーマかログインへ
    const exhausted = phase.code === "THEME_EXHAUSTED";
    const canRegenerate = exhausted && authSession !== null;

    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-kin/60 bg-kinari/5 px-10 py-12 text-center">
          <h1 className="font-mincho text-2xl tracking-widest text-kinari">{phase.message}</h1>

          {canRegenerate && (
            <p className="mt-5 text-sm leading-relaxed text-kinari/60">
              {kindLabel(kind)}のお題を作り足せます。本日の生成回数を1つ使います。
            </p>
          )}
          {exhausted && authSession === null && (
            <p className="mt-5 text-sm leading-relaxed text-kinari/60">
              ログインすると、{kindLabel(kind)}のお題を作り足して続けられます。
            </p>
          )}

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {canRegenerate && (
              <button
                type="button"
                onClick={() => void regenerate()}
                className="rounded-md border border-shu bg-shu/15 px-6 py-2.5 tracking-widest text-kinari transition-colors hover:bg-shu/25"
              >
                お題を作り足す
              </button>
            )}
            {exhausted && authSession === null && (
              <button
                type="button"
                onClick={() => authClient.signIn.social({ provider: "google" })}
                className="rounded-md border border-shu bg-shu/15 px-6 py-2.5 tracking-widest text-kinari transition-colors hover:bg-shu/25"
              >
                Googleでログイン
              </button>
            )}
            {!exhausted && (
              <button
                type="button"
                onClick={start}
                className="rounded-md border border-shu bg-shu/15 px-6 py-2.5 tracking-widest text-kinari transition-colors hover:bg-shu/25"
              >
                もう一度
              </button>
            )}
            <a
              href={backToList}
              className="rounded-md border border-kinari/20 px-6 py-2.5 tracking-widest text-kinari/80 transition-colors hover:border-kin hover:text-kinari"
            >
              ほかのお題を見る
            </a>
          </div>

          <p className="mt-8 text-sm">
            <a href="/" className="tracking-widest text-kinari/50 hover:text-kinari">
              トップへ戻る
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (phase.name === "result") {
    return (
      <Result
        stats={stats}
        missedKeys={missedKeys}
        themeName={themeName}
        onRetry={start}
        listHref={backToList}
        kind={kind}
        shareUrl={shareUrl}
      />
    );
  }

  const prompt = phase.session.prompts[promptIndex];
  if (prompt === undefined) return null;

  return (
    // **`<input>` / `<textarea>` を使わない。** 編集可能な要素があるとIMEが
    // 介入して打鍵を拾えなくなる（不変条件7）
    <div
      ref={surface}
      data-typing-surface=""
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={() => surface.current?.focus()}
      className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-8 py-6"
    >
      <header className="flex items-start justify-between border-b border-kin/40 pb-4">
        <Logo beta={beta} />
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-kinari/15 bg-kinari/5 px-4 py-1 text-xs tracking-widest text-kinari/70">
            {themeName}
          </span>
          {/*
            打鍵を拾う要素の中に置く。外に出すと、押した時点でフォーカスが
            surface から外れ、onBlur の当て直しと競合する。
            **朱は使わない。** 朱は「今すぐ打つべきもの」だけの色で、
            やめるボタンに使うとキーボードのハイライトと役割がぶつかる
          */}
          <button
            type="button"
            onClick={quit}
            className="rounded-full border border-kinari/15 px-4 py-1 text-xs tracking-widest text-kinari/50 transition-colors hover:border-kin hover:text-kinari"
          >
            やめる
            <span className="ml-2 font-mono text-kinari/40">Esc</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-8 py-8">
        <Scroll
          text={prompt.text}
          kanaUnits={splitKanaUnits(prompt.readingKana)}
          progress={progress}
        />

        <div className="flex items-center justify-between">
          <ProgressDots current={promptIndex} total={phase.session.prompts.length} />
          <span className="font-mono text-sm text-kinari/50">
            {promptIndex + 1}/{Math.min(phase.session.prompts.length, PLAY_SIZE)}
          </span>
        </div>
      </div>

      <div className="border-t border-kin/40 pt-6">
        <Keyboard nextKeys={nextKeysOf(progress)} />
      </div>

      {imeDetected && (
        <p className="mt-4 rounded-md border border-shu/50 bg-shu/10 px-4 py-3 text-center text-sm text-kinari">
          日本語入力のままです。<strong>英数入力に切り替えてください。</strong>
        </p>
      )}

      <p className="mt-4 text-center font-mono text-xs text-kinari/40">
        {romanDisplay(progress).cursor} 打目 ／ ミス {progress.missCount}
      </p>
    </div>
  );
}
