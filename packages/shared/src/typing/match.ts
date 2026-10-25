import type { RomanCandidates } from "./build";
import { SOKUON_FALLBACK } from "./table";

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
   * 確定したかなを「実際に打たれたローマ字列」で1単位ずつ持つもの。
   * `settled` をかな単位に切り戻すと（`shi` と `si` で文字数が違う）切れ目を
   * 計算できないため、打鍵時に積んでおく。長文の表示列（かな1単位に対して
   * そのローマ字列を真下に置く）で使う。
   */
  readonly typedUnits: readonly string[];
  /**
   * ミスした表示位置（ローマ字列の先頭からの通し番号）。撒菱をここに置く。
   * **同じ位置で何度ミスしても1つ**にするため Set で持つ。
   */
  readonly misses: ReadonlySet<number>;
  /** ミス打鍵の延べ回数。正確率の計算に使う（misses.size とは別物） */
  readonly missCount: number;
  /**
   * ミスした位置で**打つべきだった文字**と、その回数。
   *
   * 実際に押された誤りのキーではなく、**画面で苦無が指していた文字**を数える。
   * 「何を打ち損ねるか」は運指の弱点そのものだが、「代わりに何を押したか」は
   * 隣接キーの取り違えでばらけるだけで、練習の手がかりにならない。
   */
  readonly missedKeys: ReadonlyMap<string, number>;
  /** 正しく受理された打鍵の回数 */
  readonly hitCount: number;
  readonly finished: boolean;
}

/** 最短の候補。同じ長さなら table.ts で先に書いたもの（`ふ` は `fu`） */
function shortest(candidates: readonly string[]): string {
  return candidates.reduce((best, c) => (c.length < best.length ? c : best), candidates[0] ?? "");
}

/** 「っ」の単位か。build は「っ」に必ず SOKUON_FALLBACK を足すので、それで見分ける */
function isSokuon(unit: readonly string[] | undefined): boolean {
  return unit?.includes(SOKUON_FALLBACK[0] ?? "") ?? false;
}

/**
 * 未確定のかな `index` を画面に出す打ち方。`candidates` はその候補
 * （現在のかななら絞り込み済みの `matches`）。
 *
 * 基本は最短の候補（`し` は `si`、`ち` は `ti`）。ただし**「っ」と次のかなは
 * 揃える。** 単独で最短を取ると、`っ` は `chi` 由来の `c`、`ち` は `ti` になり
 * `まっち` が `macti` と出る。
 *
 * - 未確定の「っ」は、次のかなの表示の頭文字を重ねる（`matti`）
 * - 「っ」を子音1文字で打ち終えていたら、次のかなはその子音で始まる候補を出す
 *   （`mac` と打てば `macchi`）
 *
 * 保存済みの候補配列（`reading_roman_json`）の並びに頼らず実行時に決めるので、
 * 選び方を変えても既存のお題を作り直さなくてよい。
 */
function displayOf(p: TypingProgress, index: number, candidates: readonly string[]): string {
  const prevTyped = index - 1 < p.unitIndex ? p.typedUnits[index - 1] : undefined;
  if (prevTyped !== undefined && prevTyped.length === 1 && isSokuon(p.units[index - 1])) {
    const following = candidates.filter((c) => c.startsWith(prevTyped));
    if (following.length > 0) return shortest(following);
  }

  const next = p.units[index + 1];
  if (isSokuon(p.units[index]) && next !== undefined) {
    const head = displayOf(p, index + 1, next)[0];
    if (head !== undefined && candidates.includes(head)) return head;
  }

  return shortest(candidates);
}

/** 未確定のかなを、`unitIndex` から順に画面に出す打ち方で並べる */
function pendingDisplays(p: TypingProgress): string[] {
  return [
    displayOf(p, p.unitIndex, p.matches),
    ...p.units.slice(p.unitIndex + 1).map((unit, i) => displayOf(p, p.unitIndex + 1 + i, unit)),
  ];
}

export function startTyping(units: RomanCandidates): TypingProgress {
  const first = units[0];
  return {
    units,
    unitIndex: 0,
    input: "",
    matches: first === undefined ? [] : first.slice(),
    settled: "",
    typedUnits: [],
    misses: new Set(),
    missCount: 0,
    missedKeys: new Map(),
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
    typedUnits: [...p.typedUnits, typed],
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

  // 苦無が指していた文字は、画面に出していた候補から取る。
  // 候補が複数残っていても（`F`/`H` のような並列）、画面で見えていたのは1つ
  const expected =
    p.matches.length === 0 ? undefined : displayOf(p, p.unitIndex, p.matches)[p.input.length];
  const missedKeys = new Map(p.missedKeys);
  if (expected !== undefined) missedKeys.set(expected, (missedKeys.get(expected) ?? 0) + 1);

  return { ...p, misses, missCount: p.missCount + 1, missedKeys };
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
 * 未確定のかなは最短候補で表示する（「っ」は次のかなに揃える。`displayOf`）。
 * **打ち進めると表示が変わることがある**（`si` を表示中に `shi` で確定するなど）。
 * docs/07-ui.md で許容している副作用。
 */
export function romanDisplay(p: TypingProgress): { text: string; cursor: number } {
  return { text: p.settled + pendingDisplays(p).join(""), cursor: cursorOf(p) };
}

/**
 * かな1単位ごとの表示用ローマ字列。
 *
 * 確定済みは**実際に打たれた経路**、未確定は最短候補（「っ」は次のかなに揃える）。つなげると
 * `romanDisplay().text` と同じになる。長文では「かな1単位」と「そのローマ字列」を
 * 縦に1列にまとめるため、単位ごとに切り分けた配列が必要（連結文字列からは
 * 単位の切れ目を計算できない。`shi` と `si` で文字数が違う）。
 */
export function romanSegments(p: TypingProgress): readonly string[] {
  return [...p.typedUnits, ...pendingDisplays(p)];
}
