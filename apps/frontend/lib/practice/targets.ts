import { normalizeConstraintChar, type TypingProgress } from "@henge/shared";

/**
 * 最適化練習の「的」。お題の中で**最適化する音が出る箇所**と、そこを打てたか。
 *
 * 最適化練習は、標準運指を崩して特定の連接を速く打つ指使いを定着させるモード
 * （`presets.ts`）。文章のどこでその運指を使うのかが見えていないと、連接に
 * 差しかかってから気づくことになる。読みの行で箇所を囲み、打ち終えたら
 * ミスなく打てたか（的中）を示す。
 */

/** 的1つ。かな単位（`splitKanaUnits` の添字）の範囲で、両端を含む */
export interface TargetSpan {
  first: number;
  last: number;
}

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
 * 探し方は生成の検証（`countConstraint`）と同じ: NFC に揃え、**重なりは数えない**
 * （「ささ」に「ささ」は1回）。お題が採用された根拠と同じ箇所に的を立てるため。
 *
 * 音がかなの単位の途中から始まる・途中で終わる場合（「きゃ」の中の「ゃ」など）は、
 * その単位ごと的に含める。打鍵の単位を割って囲むことはできない。隣り合う箇所が
 * 同じ単位を共有したら1つの的にまとめる（同じかなを2つの的に入れない）。
 */
export function findTargets(kanaUnits: readonly string[], constraintChar: string): TargetSpan[] {
  const target = normalizeConstraintChar(constraintChar);
  if (target === "") return [];

  // 読みの文字位置 → かな単位の添字
  const unitAt: number[] = [];
  const units = kanaUnits.map((unit, index) => {
    const normalized = normalizeConstraintChar(unit);
    for (let i = 0; i < normalized.length; i++) unitAt.push(index);
    return normalized;
  });
  const kana = units.join("");

  const spans: TargetSpan[] = [];
  let from = 0;
  for (;;) {
    const at = kana.indexOf(target, from);
    if (at === -1) return spans;
    const first = unitAt[at] ?? 0;
    const last = unitAt[at + target.length - 1] ?? first;
    const previous = spans.at(-1);
    if (previous !== undefined && first <= previous.last) previous.last = last;
    else spans.push({ first, last });
    from = at + target.length;
  }
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
