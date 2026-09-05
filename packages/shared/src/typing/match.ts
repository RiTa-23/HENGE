import type { RomanCandidates } from "./build";

/**
 * 打鍵の判定。**候補テーブルは組み立て済みのものを受け取る**（「ん」「っ」の
 * 文脈依存は build 時に解決済みなので、ここでは先読みもバックトラックもしない）。
 *
 * すべて不変。押すたびに新しい状態を返すので、そのまま React の state に置ける。
 */
export interface TypingProgress {
  /** かな単位のローマ字候補。お題ごとに固定 */
  readonly units: RomanCandidates;
  /** 確定したかなの数。units.length に達したら完了 */
  readonly unitIndex: number;
  /** 現在のかなに打ち込み中のローマ字 */
  readonly input: string;
  /** `input` に前方一致している候補。空にはならない */
  readonly matches: readonly string[];
  /** 確定したかなを「実際に打たれた文字列」で連結したもの。表示の左側になる */
  readonly settled: string;
  /**
   * ミスした表示位置（ローマ字列の先頭からの通し番号）。撒菱をここに置く。
   * **同じ位置で何度ミスしても1つ**にするため Set で持つ。
   */
  readonly misses: ReadonlySet<number>;
  /** ミス打鍵の延べ回数。正確率の計算に使う（misses.size とは別物） */
  readonly missCount: number;
  /** 正しく受理された打鍵の回数 */
  readonly hitCount: number;
  readonly finished: boolean;
}

/** 最短の候補。表示とカーソル位置の基準に使う */
function shortest(candidates: readonly string[]): string {
  return candidates.reduce((best, c) => (c.length < best.length ? c : best));
}

export function startTyping(units: RomanCandidates): TypingProgress {
  const first = units[0];
  return {
    units,
    unitIndex: 0,
    input: "",
    matches: first === undefined ? [] : first.slice(),
    settled: "",
    misses: new Set(),
    missCount: 0,
    hitCount: 0,
    finished: units.length === 0,
  };
}

/** 現在のかなを `typed` で確定し、次のかなへ進める */
function confirmUnit(p: TypingProgress, typed: string): TypingProgress {
  const unitIndex = p.unitIndex + 1;
  const next = p.units[unitIndex];
  return {
    ...p,
    unitIndex,
    input: "",
    matches: next === undefined ? [] : next.slice(),
    settled: p.settled + typed,
    finished: next === undefined,
  };
}

/** 現在のカーソル位置＝撒菱を置く位置 */
function cursorOf(p: TypingProgress): number {
  return p.settled.length + p.input.length;
}

function recordMiss(p: TypingProgress): TypingProgress {
  const misses = new Set(p.misses);
  misses.add(cursorOf(p));
  return { ...p, misses, missCount: p.missCount + 1 };
}

/**
 * 1打を処理する。受理されれば前進し、されなければミスとして記録する。
 * **ミスしても状態は巻き戻さない**（打ち直せばそのまま続行できる）。
 *
 * `key` は英数字1文字を想定する。Shift併用の記号（`！` `？`）は
 * 呼び出し側が `!` `?` に正規化してから渡す。
 */
export function pressKey(p: TypingProgress, key: string): TypingProgress {
  if (p.finished) return p;

  const attempt = p.input + key;
  const extended = p.matches.filter((candidate) => candidate.startsWith(attempt));

  if (extended.length > 0) {
    const advanced = { ...p, hitCount: p.hitCount + 1 };
    // 完全一致し、かつこれ以上伸びる候補が無いなら確定する。
    // 伸びる候補が残っている間は保留する（`n` の後に `n` が来るかもしれない）
    if (extended.length === 1 && extended[0] === attempt) return confirmUnit(advanced, attempt);
    // 末尾のかなには次の打鍵が来ないため、確定を保留すると永遠に終わらない
    if (extended.includes(attempt) && p.unitIndex === p.units.length - 1) {
      return confirmUnit(advanced, attempt);
    }
    return { ...advanced, input: attempt, matches: extended };
  }

  // 伸ばせない場合でも、**いま打ち込み済みの文字列がちょうど候補と一致していれば
  // そのかなを確定し、この打鍵を次のかなに回す。** 「んか」を `nka` で打つ経路。
  // 確定は build 時に済んでいるので、ここで戻るのはこの1段だけ
  if (p.matches.includes(p.input) && p.unitIndex < p.units.length - 1) {
    return pressKey(confirmUnit(p, p.input), key);
  }

  return recordMiss(p);
}

/**
 * 画面に出すローマ字列と、苦無（キャレット）を置く位置。
 *
 * 未確定のかなは最短候補で表示する。**打ち進めると表示が変わることがある**
 * （`shi` を表示中に `si` で確定するなど）。docs/07-ui.md で許容している副作用。
 */
export function romanDisplay(p: TypingProgress): { text: string; cursor: number } {
  const current = p.matches.length === 0 ? "" : shortest(p.matches);
  const future = p.units
    .slice(p.unitIndex + 1)
    .map((unit) => shortest(unit))
    .join("");
  return { text: p.settled + current + future, cursor: cursorOf(p) };
}
