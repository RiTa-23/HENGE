import type { TypingProgress } from "@henge/shared";
import { romanDisplay } from "@henge/shared";
import type { ReactNode } from "react";
import { type TargetSpan, targetState } from "@/lib/practice/targets";
import { Makibishi } from "./Makibishi";
import "./ninja.css";

/** 打鍵済み・現在・未来でかなの明度を変える。朱は「いま打つ1かな」だけ */
function kanaClass(index: number, unitIndex: number): string {
  if (index < unitIndex) return "text-kinari";
  if (index === unitIndex) return "text-shu";
  return "text-kinari/35";
}

export interface PromptLinesProps {
  text: string;
  kanaUnits: string[];
  progress: TypingProgress;
  /**
   * 的（最適化する音の箇所）。最適化練習の的板だけが渡す（`findTargets`）。
   * 読みの行でその範囲のかなを輪で囲む
   */
  targets?: readonly TargetSpan[];
}

/**
 * 読みの行。的の範囲のかなは輪（`.mato-target`）で囲む。
 *
 * 輪の色が状態を表す（ninja.css）。未着手は薄く、苦無が中にある間は朱（今すぐ
 * 打つべきもの）、ミスなく打ち終えたら金の二重線（的中）、途中でミスしたら撒菱の色。
 * 輪は最初から全部の的に出しておく。打ち進めて輪が現れると、そこでかなの幅が変わって
 * 読みの行がずれる。
 */
function kanaLine(
  kanaUnits: string[],
  progress: TypingProgress,
  targets: readonly TargetSpan[],
): ReactNode[] {
  const kana = (index: number) => (
    <span key={index} className={kanaClass(index, progress.unitIndex)}>
      {kanaUnits[index]}
    </span>
  );

  const nodes: ReactNode[] = [];
  let index = 0;
  for (const span of targets) {
    for (; index < span.first; index++) nodes.push(kana(index));
    const inside: ReactNode[] = [];
    for (; index <= span.last; index++) inside.push(kana(index));
    nodes.push(
      <span
        key={`target-${span.first}`}
        className={`mato-target mato-target--${targetState(span, progress)}`}
      >
        {inside}
      </span>,
    );
  }
  for (; index < kanaUnits.length; index++) nodes.push(kana(index));
  return nodes;
}

/**
 * 短文・単語の中身。お題の本文・読み・ローマ字列の3行。
 *
 * **載せる物体（巻物／的板）とは分けてある。** テーマは巻物（`Scroll`）、
 * 最適化練習は的板（`MatoBoard`）に同じ3行を載せる。違うのは物体だけで、
 * 打鍵の見せ方（苦無・撒菱・かなの色）は両モードで変えない。足すのは的板の
 * 読みの行の的（`targets`）だけ。
 *
 * 本文（漢字かな混じり）は色を進めない。読み仮名と本文の文字位置を対応づける
 * 情報を持っていないため、進捗に合わせて色を変えると必ずずれる。
 * 進捗は読みの行とローマ字の行で示す。
 */
export function PromptLines({ text, kanaUnits, progress, targets = [] }: PromptLinesProps) {
  const { text: roman, cursor } = romanDisplay(progress);

  return (
    <>
      <p className="text-balance text-center font-mincho text-3xl leading-snug tracking-[0.06em] text-kinari">
        {text}
      </p>

      <p className="text-center font-mincho text-lg tracking-wide">
        {kanaLine(kanaUnits, progress, targets)}
      </p>

      {/* ローマ字列。1文字ずつ span にするのは、苦無と撒菱を
          「その文字の真下／真上」に置くため（かな単位ではない）。
          折り返しの行間（gap-y）は苦無の高さぶん取る。詰めると次の行に食い込む */}
      <p className="flex flex-wrap justify-center gap-y-11 font-mono text-xl tracking-[0.22em]">
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
    </>
  );
}
