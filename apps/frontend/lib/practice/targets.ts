import { type ConstraintSpan, findConstraintSpans, type TypingProgress } from "@henge/shared";

/**
 * 最適化練習の「的」。お題の中で**最適化する音が出る箇所**と、そこを打てたか。
 *
 * 最適化練習は、標準運指を崩して特定の連接を速く打つ指使いを定着させるモード
 * （`presets.ts`）。文章のどこでその運指を使うのかが見えていないと、連接に
 * 差しかかってから気づくことになる。読みの行で箇所を囲み、打ち終えたら
 * ミスなく打てたか（的中）を示す。
 */

/** 的1つ。かな単位（`splitKanaUnits` の添字）の範囲で、両端を含む */
export type TargetSpan = ConstraintSpan;

/**
 * - `pending`: まだ差しかかっていない
 * - `active`: いま打っている（苦無がこの中にある）
 * - `hit`: ミスなく打ち終えた（的中）
 * - `miss`: 打ち終えたが、途中でミスした
 */
export type TargetState = "pending" | "active" | "hit" | "miss";

/**
 * 読みの中から最適化する音の箇所を探し、かな単位の範囲で返す。
 *
 * 探し方は生成の検証（`countConstraint`）と同じ関数（`findConstraintSpans`）。お題が
 * 採用された根拠と同じ箇所に的を立てるため。打鍵の単位の並びで探すので、字面では
 * 含まれていても打つときには別のかなになる箇所（「でぃ」の「で」、「きゃ」の「き」）には
 * 的を立てない。
 */
export function findTargets(kanaUnits: readonly string[], constraintChar: string): TargetSpan[] {
  return findConstraintSpans(kanaUnits, constraintChar);
}

/** かな単位 `unit` が始まるローマ字の表示位置。確定済みの単位にだけ使える */
function romanOffset(progress: TypingProgress, unit: number): number {
  let offset = 0;
  for (const typed of progress.typedUnits.slice(0, unit)) offset += typed.length;
  return offset;
}

/**
 * 的1つの状態。
 *
 * ミスは `TypingProgress.misses`（ローマ字の表示位置）で持たれているので、
 * 的の範囲のかなが**実際に打たれたローマ字**の範囲と照らす（`typedUnits`。
 * `shi` と `si` で長さが違うので、表示の文字列からは切れ目を出せない）。
 * ミスはそのとき打っていたかなの範囲に記録される（`match.ts` の `cursorOf`）ので、
 * 範囲の外のミスを拾ったり、範囲の中のミスを落としたりしない。
 */
export function targetState(span: TargetSpan, progress: TypingProgress): TargetState {
  if (progress.unitIndex < span.first) return "pending";
  if (progress.unitIndex <= span.last) return "active";

  const start = romanOffset(progress, span.first);
  const end = romanOffset(progress, span.last + 1);
  for (const at of progress.misses) {
    if (at >= start && at < end) return "miss";
  }
  return "hit";
}

/** 的中数と的の数。1プレイ（10問）を通して足し合わせる */
export interface TargetTally {
  hits: number;
  total: number;
}

export const EMPTY_TALLY: TargetTally = { hits: 0, total: 0 };

/** 打ち終えたお題1問ぶんの的を数え、`tally` に足す */
export function addTally(
  tally: TargetTally,
  spans: readonly TargetSpan[],
  progress: TypingProgress,
): TargetTally {
  const hits = spans.filter((span) => targetState(span, progress) === "hit").length;
  return { hits: tally.hits + hits, total: tally.total + spans.length };
}
