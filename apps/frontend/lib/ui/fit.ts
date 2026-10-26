/**
 * 画面に収めるための縮小率（`FitScreen`）。**1より大きくしない**（拡大はしない）。
 *
 * `previous` を渡すと、**それより大きくは戻さない。** 同じ画面の大きさのまま
 * 問題が替わるたびに中身の高さは少しずつ変わる。そのたびに縮小率が上下すると
 * 文字の大きさが揺れて打ちにくい。画面の大きさが変わったときは `previous` を
 * 渡さずに測り直す。
 */
export function fitScale(natural: number, available: number, previous?: number): number {
  const fresh = natural <= 0 || available <= 0 ? 1 : Math.min(1, available / natural);
  return previous === undefined ? fresh : Math.min(previous, fresh);
}
