import type { TypingProgress } from "@henge/shared";
import { romanDisplay } from "@henge/shared";
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
}

/**
 * 短文・単語の中身。お題の本文・読み・ローマ字列の3行。
 *
 * **載せる物体（巻物／的板）とは分けてある。** テーマは巻物（`Scroll`）、
 * 最適化練習は的板（`MatoBoard`）に同じ3行を載せる。違うのは物体だけで、
 * 打鍵の見せ方（苦無・撒菱・かなの色）は両モードで変えない。
 *
 * 本文（漢字かな混じり）は色を進めない。読み仮名と本文の文字位置を対応づける
 * 情報を持っていないため、進捗に合わせて色を変えると必ずずれる。
 * 進捗は読みの行とローマ字の行で示す。
 */
export function PromptLines({ text, kanaUnits, progress }: PromptLinesProps) {
  const { text: roman, cursor } = romanDisplay(progress);

  return (
    <>
      <p className="text-balance text-center font-mincho text-3xl leading-snug tracking-[0.06em] text-kinari">
        {text}
      </p>

      <p className="text-center font-mincho text-lg tracking-wide">
        {kanaUnits.map((unit, index) => (
          <span key={index} className={kanaClass(index, progress.unitIndex)}>
            {unit}
          </span>
        ))}
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
