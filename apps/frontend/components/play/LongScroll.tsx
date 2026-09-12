"use client";

import type { TypingProgress } from "@henge/shared";
import { romanDisplay } from "@henge/shared";
import { useLayoutEffect, useRef } from "react";
import { Makibishi } from "./Makibishi";
import "./ninja.css";

/** 打鍵済み・現在・未来でかなの明度を変える。朱は「いま打つ1かな」だけ（Scroll と同じ） */
function kanaClass(index: number, unitIndex: number): string {
  if (index < unitIndex) return "text-kinari";
  if (index === unitIndex) return "text-shu";
  return "text-kinari/35";
}

/**
 * いま打っている位置が窓のこの割合の位置に来るように、行を横へずらす。
 * 左に寄せすぎると打ち終えた部分が見えず、真ん中だと先が読めない
 */
const ANCHOR_RATIO = 0.3;

/**
 * 読み・ローマ字の行を**横にスライドさせる**。
 *
 * 長文は1行に収まらないが、折り返すと「いまどこを打っているか」を目で探すことになる。
 * 1行のまま `overflow: hidden` の窓に入れ、現在位置が窓の3割の位置に来るように
 * `transform` でずらす（画像のイメージ）。`useLayoutEffect` で測るのは、描画の後に
 * ずらすと1フレームだけ位置がずれて見えるため。
 */
function useSlide(currentIndex: number) {
  const window = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const frame = window.current;
    const line = track.current;
    if (frame === null || line === null) return;
    const current = line.children[currentIndex] as HTMLElement | undefined;
    if (current === undefined) return;
    const shift = Math.max(0, current.offsetLeft - frame.clientWidth * ANCHOR_RATIO);
    line.style.transform = `translateX(${-shift}px)`;
  }, [currentIndex]);

  return { window, track };
}

interface LongScrollProps {
  text: string;
  kanaUnits: string[];
  progress: TypingProgress;
}

/**
 * 長文の巻物。**キーボードを出さないぶん縦に大きく**、紙の大半を本文で埋める。
 *
 * 本文（漢字かな混じり）には色を付けない。表記と読みの対応を持っていないため、
 * 進捗に合わせて色を変えると必ずずれる（短文の `Scroll` と同じ）。進捗は下の
 * 読み・ローマ字の行で示し、どちらも横スライドで現在位置を見せる。苦無・撒菱は
 * 短文と同じ置き方（ローマ字1文字ごとの真下／真上）。
 *
 * `.scroll` の作りは短文・一覧・詳細と同じ（別の物体に見せない）。
 */
export function LongScroll({ text, kanaUnits, progress }: LongScrollProps) {
  const { text: roman, cursor } = romanDisplay(progress);
  const kana = useSlide(progress.unitIndex);
  const romanLine = useSlide(cursor);

  return (
    <div className="scroll scroll--long mx-auto w-full max-w-4xl">
      <div className="scroll__roller" />

      <div className="scroll__sheet flex min-h-[60vh] flex-col px-5 py-8 sm:px-12 sm:py-10">
        {/* 本文。左揃えで行間を広く取り、読みながら打てるようにする */}
        <p className="flex-1 font-mincho text-xl leading-loose tracking-[0.04em] text-kinari sm:text-2xl">
          {text}
        </p>

        {/* 金は細い線まで。本文と打鍵の行を分ける折り目 */}
        <hr className="my-6 border-0 border-t border-kin/40" />

        {/* 読み仮名の行。1行のまま横にずらす */}
        <div ref={kana.window} className="overflow-hidden">
          <p
            ref={kana.track}
            className="flex font-mincho text-lg tracking-wide whitespace-nowrap transition-transform duration-150 ease-out motion-reduce:transition-none"
          >
            {kanaUnits.map((unit, index) => (
              <span key={index} className={kanaClass(index, progress.unitIndex)}>
                {unit}
              </span>
            ))}
          </p>
        </div>

        {/* ローマ字の行。上に撒菱、下に苦無が出るぶんの余白を窓の中に取る
            （窓は overflow: hidden なので、外に出した余白では切れる） */}
        <div ref={romanLine.window} className="mt-2 overflow-hidden pt-7 pb-11">
          <p
            ref={romanLine.track}
            className="flex font-mono text-xl tracking-[0.22em] whitespace-nowrap transition-transform duration-150 ease-out motion-reduce:transition-none"
          >
            {[...roman].map((letter, index) => (
              <span
                key={index}
                className={
                  index < cursor
                    ? "relative text-kinari/70"
                    : index === cursor
                      ? "relative text-kinari"
                      : "relative text-kinari/30"
                }
              >
                {letter}
                {progress.misses.has(index) && <Makibishi />}
                {index === cursor && (
                  <span className="kunai" aria-hidden="true">
                    <span className="kunai__blade" />
                    <span className="kunai__ring" />
                  </span>
                )}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="scroll__roller" />
    </div>
  );
}
