"use client";

import type { TypingProgress } from "@henge/shared";
import { romanSegments } from "@henge/shared";
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
 * かな1単位とそのローマ字列を1列にまとめた**単位列を横にスライドさせる**。
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
 * 読み・ローマ字の行で示す。
 *
 * 読み行とローマ字行は**1本のトラックにまとめた単位列**で作る。かな1単位の真下に
 * そのローマ字列が来るように縦に積むと、2行が別々にスライドする構造が消えて
 * 絶対にずれない（別々に測って動かすと、ローマ字が1〜5文字で可変なぶん列は
 * 初期表示から崩れる）。列の幅は**ローマ字4文字ぶんで固定**する。列幅をローマ字列に
 * 任せると幅が1〜4文字で変わり、かな行の間隔が不揃いになる。固定幅ならかな行も
 * 等間隔になり、ローマ字列は1単位ずつのかたまりとして読める。幅は最長の表示列
 * （「ちゅう」= `chuu` の4文字）が収まるように取る。スライドは単位の位置で動かす。
 * 苦無・撒菱は短文と同じ置き方（ローマ字1文字の真下／真上）。
 *
 * `.scroll` の作りは短文・一覧・詳細と同じ（別の物体に見せない）。
 */
export function LongScroll({ text, kanaUnits, progress }: LongScrollProps) {
  const segments = romanSegments(progress);
  const slide = useSlide(progress.unitIndex);

  // 撒菱・苦無はローマ字1文字ごとの通し番号で紐づく。列ごとに区切っても
  // 文字列そのものは `romanDisplay().text` と同じなので、先頭からの通し番号で数える
  let letterCount = 0;
  const columns = segments.map((segment, unitIndex) => {
    const start = letterCount;
    letterCount += segment.length;
    return { segment, unitIndex, start };
  });
  // 苦無（キャレット）の位置＝確定済みの文字数＋打ち込み中の文字数（cursorOf と同じ）
  const cursor = progress.settled.length + progress.input.length;

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

        {/* 読み仮名とローマ字を1列にまとめた単位列。1行のまま横にずらす。
            撒菱はローマ字の真上、苦無は真下に出るぶんの余白を列の中に取る
            （窓は overflow: hidden なので、外に出した余白では切れる） */}
        <div ref={slide.window} className="overflow-hidden">
          <p
            ref={slide.track}
            className="flex font-mono text-xl tracking-[0.22em] whitespace-nowrap transition-transform duration-150 ease-out motion-reduce:transition-none"
          >
            {columns.map(({ segment, unitIndex, start }) => (
              <span key={unitIndex} className="flex w-[3.3em] shrink-0 flex-col items-center">
                <span
                  className={`font-mincho text-lg tracking-wide ${kanaClass(unitIndex, progress.unitIndex)}`}
                >
                  {kanaUnits[unitIndex]}
                </span>
                <span className="mb-11 mt-9 flex me-[-0.22em]">
                  {/* 字間（tracking）は1文字ごとに末尾にも付く。列の最後の1文字ぶんを
                      打ち消さないと、かなが右寄りに置かれてしまう */}
                  {[...segment].map((letter, offset) => {
                    const index = start + offset;
                    return (
                      <span
                        key={offset}
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
                    );
                  })}
                </span>
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="scroll__roller" />
    </div>
  );
}
