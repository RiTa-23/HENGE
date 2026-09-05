"use client";

import {
  isApiError,
  PLAY_SIZE,
  pressKey,
  type RomanCandidates,
  romanDisplay,
  splitKanaUnits,
  startTyping,
  type TypingProgress,
} from "@henge/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Keyboard, type NextKey, toNextKey } from "./Keyboard";
import { Loading } from "./Loading";
import { ProgressDots } from "./ProgressDots";
import { Result, type PlayStats } from "./Result";
import { Scroll } from "./Scroll";
import { readOffset, writeOffset } from "@/lib/play/offset";

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
  | { name: "loading" }
  | { name: "error"; code: string; message: string }
  | { name: "playing"; session: SessionResponse }
  | { name: "result"; session: SessionResponse };

/** 次に打てるキー。候補それぞれの「いま打つべき1文字」を集める */
function nextKeysOf(progress: TypingProgress): NextKey[] {
  const letters = new Set(
    progress.matches
      .map((candidate) => candidate[progress.input.length])
      .filter((letter): letter is string => letter !== undefined),
  );
  return [...letters].map((letter) => toNextKey(letter));
}

/** 打鍵として扱うキーか。修飾キー付きのショートカットは拾わない */
function isTypingKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  // Shift は `！` `？` の入力に要るので許す。key が1文字のものだけ受ける
  return [...event.key].length === 1;
}

export function PlayScreen({ themeId, themeName }: { themeId: string; themeName: string }) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [promptIndex, setPromptIndex] = useState(0);
  const [progress, setProgress] = useState<TypingProgress>(() => startTyping([]));
  const [stats, setStats] = useState<PlayStats>({ hits: 0, misses: 0, elapsedMs: 0 });
  const startedAt = useRef<number>(0);
  const surface = useRef<HTMLDivElement>(null);

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
      setPhase({ name: "error", code, message });
      return;
    }

    const session = body as SessionResponse;
    // **返された時点で消費が確定する。** 中断しても巻き戻さない
    writeOffset(themeId, session.nextOffset);
    setPromptIndex(0);
    setStats({ hits: 0, misses: 0, elapsedMs: 0 });
    startedAt.current = performance.now();
    setProgress(startTyping(session.prompts[0]?.readingRoman ?? []));
    setPhase({ name: "playing", session });
  }, [themeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 打鍵を拾う要素にフォーカスを当て続ける。外れると1打も拾えなくなる
  useEffect(() => {
    if (phase.name === "playing") surface.current?.focus();
  }, [phase.name]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (phase.name !== "playing" || !isTypingKey(event.nativeEvent)) return;
    event.preventDefault();

    const next = pressKey(progress, event.key);
    if (!next.finished) {
      setProgress(next);
      return;
    }

    // 1問終わり。統計を畳んでから次の問題へ
    const hits = stats.hits + next.hitCount;
    const misses = stats.misses + next.missCount;
    const upcoming = promptIndex + 1;

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

  if (phase.name === "loading") {
    return <Loading message="お題を用意しています" note="生成が要る場合は十数秒かかります。" />;
  }

  if (phase.name === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-kin/60 bg-kinari/5 px-10 py-12 text-center">
          <h1 className="font-mincho text-2xl tracking-widest text-kinari">{phase.message}</h1>
          <div className="mt-10 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-shu bg-shu/15 px-6 py-2.5 tracking-widest text-kinari"
            >
              もう一度
            </button>
            <a
              href="/themes"
              className="rounded-md border border-kinari/20 px-6 py-2.5 tracking-widest text-kinari/80"
            >
              テーマ一覧へ
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === "result") {
    return <Result stats={stats} themeName={themeName} onRetry={() => void load()} />;
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
      className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-8 py-6"
    >
      <header className="flex items-start justify-between border-b border-kin/40 pb-4">
        <Logo />
        <span className="rounded-full border border-kinari/15 bg-kinari/5 px-4 py-1 text-xs tracking-widest text-kinari/70">
          {themeName}
        </span>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-8 py-8">
        <Scroll
          text={prompt.text}
          kanaUnits={splitKanaUnits(prompt.readingKana)}
          progress={progress}
          remainingInPool={phase.session.remainingInPool}
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

      <p className="mt-4 text-center font-mono text-xs text-kinari/40">
        {romanDisplay(progress).cursor} 打目 ／ ミス {progress.missCount}
      </p>
    </div>
  );
}
