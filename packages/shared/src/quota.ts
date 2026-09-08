import { DAILY_NEURON_LIMIT } from "./session";

/**
 * 本日の残ニューロン。使用量が上限を超えている場合（超過を許すため、また
 * 並行リクエストで判定と加算の間にずれ込んだ場合）は0に張り付ける。
 * マイナスの残数を UI に表示しないため。
 */
export function remainingNeurons(used: number): number {
  return Math.max(0, DAILY_NEURON_LIMIT - used);
}

/**
 * 生成を許可するか。新規作成・再生成のクォータ判定と、バックグラウンド補充の
 * 許可フラグ（allowRefill）の両方に使う。**判定は Next.js 側で行う。**
 *
 * **1回分を予約しない。** 残っていれば通し、実際に使った分をそのまま記録する
 * ので、最後の1回は上限を20前後超えることがある。見積り分を先に引く方式は、
 * モデルを変えるたびに見積り定数を手で直すことになり、外したときは
 * 「残っているのに生成できない」という形で利用者側に出る。
 */
export function canGenerate(used: number): boolean {
  return remainingNeurons(used) > 0;
}
