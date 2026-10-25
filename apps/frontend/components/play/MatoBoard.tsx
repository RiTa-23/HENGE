import { PromptLines, type PromptLinesProps } from "./PromptLines";
import "./ninja.css";

/**
 * 的板（まといた）。最適化練習の短文を載せる物体。**テーマの巻物と分ける。**
 *
 * 最適化練習は「1つの連接に狙いを絞り、繰り返し打ち込む」モードで、紋も的
 * （`PracticeMark`）。プレイ画面まで巻物だと、どちらを遊んでいるかが見た目で
 * 分からず、紋と画面の対応も切れる。木の板に描いた的に、同じ3行を載せる。
 *
 * 中身（本文・読み・ローマ字）は `PromptLines` で巻物と共通。大きさも巻物の紙と
 * 揃える（`max-w-3xl`・`min-h-60`）。物体を替えても、打つ文章の位置が動かないように。
 */
export function MatoBoard(props: PromptLinesProps) {
  return (
    <div className="mato mx-auto flex min-h-60 w-full max-w-3xl flex-col items-center justify-center gap-5 px-8 py-12">
      <PromptLines {...props} />
    </div>
  );
}
