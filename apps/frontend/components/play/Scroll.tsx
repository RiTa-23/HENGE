import type { TypingProgress } from "@henge/shared";
import { romanDisplay } from "@henge/shared";
import "./ninja.css";

/** 打鍵済み・現在・未来でかなの明度を変える。朱は「いま打つ1かな」だけ */
function kanaClass(index: number, unitIndex: number): string {
  if (index < unitIndex) return "text-kinari";
  if (index === unitIndex) return "text-shu";
  return "text-kinari/35";
}

interface ScrollProps {
  text: string;
  kanaUnits: string[];
  progress: TypingProgress;
}

/**
 * 巻物。お題の本文・読み・ローマ字列を載せる。
 *
 * 本文（漢字かな混じり）は色を進めない。読み仮名と本文の文字位置を対応づける
 * 情報を持っていないため、進捗に合わせて色を変えると必ずずれる。
 * 進捗は読みの行とローマ字の行で示す。
 */
export function Scroll({ text, kanaUnits, progress }: ScrollProps) {
  const { text: roman, cursor } = romanDisplay(progress);

  return (
    <div className="scroll mx-auto w-full max-w-3xl">
      <div className="scroll__roller" />

      <div className="scroll__sheet flex min-h-60 flex-col items-center justify-center gap-5 px-8 py-12">
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
              {progress.misses.has(index) && <span className="makibishi" aria-hidden="true" />}
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

      <div className="scroll__roller" />
    </div>
  );
}
