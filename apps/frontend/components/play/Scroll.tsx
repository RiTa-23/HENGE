import { PromptLines, type PromptLinesProps } from "./PromptLines";
import "./ninja.css";

/**
 * 巻物。テーマの短文・単語を載せる物体。中身（本文・読み・ローマ字）は
 * `PromptLines` が持ち、最適化練習の的板（`MatoBoard`）と共通。
 */
export function Scroll(props: PromptLinesProps) {
  return (
    <div className="scroll mx-auto w-full max-w-3xl">
      <div className="scroll__roller" />

      <div className="scroll__sheet flex min-h-60 flex-col items-center justify-center gap-5 px-8 py-12">
        <PromptLines {...props} />
      </div>

      <div className="scroll__roller" />
    </div>
  );
}
