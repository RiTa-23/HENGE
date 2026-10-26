import {
  KANA_TABLE,
  normalizeConstraintChar,
  romanSegments,
  splitKanaUnits,
  type TypingProgress,
} from "@henge/shared";
import { type Finger, type FingerName, fingerOf, type Hand } from "@/lib/play/fingers";
import { storage } from "@/lib/play/prefs";
import type { TargetSpan } from "./targets";

/**
 * 最適化の運指。最適化する音を**どの打ち方で、どの指で打つか**を利用者が決めたもの。
 *
 * 最適化練習は、標準運指で同じ指が続く連接を別の指に置き換えて速く打つ練習
 * （`presets.ts`）。運指ガイドが標準運指のままだと、崩したい箇所でまさに標準の指を
 * 案内してしまう。的の箇所では、ここで決めた打ち方をローマ字列に出し、決めた指を
 * 運指ガイドに出す（docs/07-ui.md「最適化の運指」）。
 *
 * 音を打鍵の単位（`splitKanaUnits`）に切り、単位ごとに打ち方と、その各文字の指を持つ。
 * 「き」なら `ki` を `k`（右 人差し指）・`i`（右 中指）で打つ、のように。
 */

/** かな1単位の運指。`fingers` は `roman` の1文字ずつに対応する */
export interface UnitFingering {
  roman: string;
  fingers: readonly Finger[];
}

/**
 * 音1つの運指。`units` は `fingeringUnits()` と同じ並び・同じ長さ。
 * 決められない単位（「ん」「っ」）は null
 */
export interface Fingering {
  units: readonly (UnitFingering | null)[];
}

/** 最適化する音を打鍵の単位に切る。的の探し方（`findConstraintSpans`）と同じ切り方 */
export function fingeringUnits(sound: string): string[] {
  return splitKanaUnits(normalizeConstraintChar(sound));
}

/**
 * かな1単位の打ち方の一覧。並びは table.ts のまま（先頭が画面の既定の打ち方）。
 *
 * **「ん」「っ」は空**（決められない）。前後のかなで打ち方が変わり（`n` / `nn`、
 * 次の子音を重ねる `kk`）、1つに決めておけない
 */
export function romanChoices(unit: string): readonly string[] {
  return KANA_TABLE[unit] ?? [];
}

/** 打ち方の各文字を標準運指で押す指。キーボードに無い文字があれば null */
export function standardFingers(roman: string): Finger[] | null {
  const fingers: Finger[] = [];
  for (const letter of roman) {
    const finger = fingerOf(letter.toUpperCase());
    if (finger === null) return null;
    fingers.push(finger);
  }
  return fingers;
}

/** 打ち方 `roman` を標準運指で打つ運指 */
export function standardUnit(roman: string): UnitFingering | null {
  const fingers = standardFingers(roman);
  return fingers === null ? null : { roman, fingers };
}

/**
 * 画面に出す運指。決めていない単位は既定（table.ts の先頭の打ち方を標準運指で）で埋める。
 * `fingering` が null（何も決めていない）なら全部既定
 */
export function resolveFingering(sound: string, fingering: Fingering | null): Fingering {
  return {
    units: fingeringUnits(sound).map((unit, i) => {
      const first = romanChoices(unit)[0];
      if (first === undefined) return null;
      return fingering?.units[i] ?? standardUnit(first);
    }),
  };
}

function sameFinger(a: Finger, b: Finger): boolean {
  return a.hand === b.hand && a.finger === b.finger;
}

/** 2つの運指が画面に同じ運指を出すか。null（決めていない）は既定（標準運指）として比べる */
export function sameFingering(sound: string, a: Fingering | null, b: Fingering | null): boolean {
  const left = resolveFingering(sound, a).units;
  const right = resolveFingering(sound, b).units;
  return left.every((unit, i) => {
    const other = right[i];
    if (unit == null || other == null) return unit == null && other == null;
    return (
      unit.roman === other.roman &&
      unit.fingers.length === other.fingers.length &&
      unit.fingers.every((f, j) => {
        const g = other.fingers[j];
        return g !== undefined && sameFinger(f, g);
      })
    );
  });
}

/** 既定の運指（table.ts の先頭の打ち方を標準運指で）と同じか */
export function isDefaultFingering(sound: string, fingering: Fingering): boolean {
  return sameFingering(sound, fingering, null);
}

// ---- 保存 ----

const HANDS: readonly Hand[] = ["left", "right"];
const FINGER_NAMES: readonly FingerName[] = ["pinky", "ring", "middle", "index", "thumb"];

/** 保存のキー。音は NFC に揃える（結合濁点で書かれた音でも同じ設定を開く） */
function keyOf(sound: string): string {
  return `henge:fingering:${normalizeConstraintChar(sound)}`;
}

/**
 * 保存の形。指は `"right-index"` のような文字列で持つ。
 * localStorage と、最適化の既定の運指（`themes.default_fingering_json`）で同じ形
 */
export interface StoredFingering {
  units: ({ roman: string; fingers: string[] } | null)[];
}

export function encodeFingering(fingering: Fingering): StoredFingering {
  return {
    units: fingering.units.map((unit) =>
      unit === null
        ? null
        : { roman: unit.roman, fingers: unit.fingers.map((f) => `${f.hand}-${f.finger}`) },
    ),
  };
}

function decodeFinger(value: unknown): Finger | null {
  if (typeof value !== "string") return null;
  const [hand, finger] = value.split("-");
  const h = HANDS.find((x) => x === hand);
  const f = FINGER_NAMES.find((x) => x === finger);
  return h === undefined || f === undefined ? null : { hand: h, finger: f };
}

/**
 * 保存された値を読む。**形が合わなければ全体を null（既定）に倒す。**
 *
 * 音の切り方と合わない（単位の数が違う）・その単位で打てない打ち方・文字数と指の数が
 * 合わない、のどれかでも捨てる。半端に読むと、ある文字だけ指が出ないような、
 * 画面から原因の見えない壊れ方になる。
 *
 * 最適化の既定の運指（サーバーから JSON のまま届く）と、作成時の入力検証もこれで読む。
 */
export function decodeFingering(value: unknown, sound: string): Fingering | null {
  const units = fingeringUnits(sound);
  const stored = (value as { units?: unknown } | null)?.units;
  if (!Array.isArray(stored) || stored.length !== units.length) return null;

  const parsed: (UnitFingering | null)[] = [];
  for (const [i, unit] of units.entries()) {
    const entry: unknown = stored[i];
    if (entry === null) {
      parsed.push(null);
      continue;
    }
    const { roman, fingers } = (entry ?? {}) as { roman?: unknown; fingers?: unknown };
    if (typeof roman !== "string" || !romanChoices(unit).includes(roman)) return null;
    if (!Array.isArray(fingers) || fingers.length !== roman.length) return null;
    const decoded = fingers.map(decodeFinger);
    if (decoded.some((f) => f === null)) return null;
    parsed.push({ roman, fingers: decoded as Finger[] });
  }
  return { units: parsed };
}

/** localStorage の文字列を読む。JSON として読めなければ null */
export function parseFingering(raw: string | null, sound: string): Fingering | null {
  if (raw === null) return null;
  try {
    return decodeFingering(JSON.parse(raw), sound);
  } catch {
    return null;
  }
}

/** 音 `sound` の運指。決めていなければ null */
export function readFingering(sound: string): Fingering | null {
  return parseFingering(storage()?.getItem(keyOf(sound)) ?? null, sound);
}

/**
 * 保存する。**既定と同じなら消す**（「既定に戻す」も null を渡す）。
 *
 * 既定は、その最適化の作成者が決めた運指（`base`）。無ければ標準運指。
 * 作成者の運指がある練習で標準運指を選んだときは、消さずに保存する
 * （消すと作成者の運指に戻ってしまう）
 */
export function writeFingering(
  sound: string,
  fingering: Fingering | null,
  base: Fingering | null = null,
): void {
  try {
    if (fingering === null || sameFingering(sound, fingering, base)) {
      storage()?.removeItem(keyOf(sound));
    } else {
      storage()?.setItem(keyOf(sound), JSON.stringify(encodeFingering(fingering)));
    }
  } catch {
    // 容量超過・書き込み禁止。次に開いたとき標準に戻るだけで、プレイは続けられる
  }
}

// ---- プレイ中 ----

/**
 * お題の的の箇所に出す打ち方（かなの添字 → 打ち方）。`startTyping` の `chosen` に渡す。
 * 決めていない単位は入れない（table.ts の並びで出す）
 */
export function chosenRomans(
  fingering: Fingering | null,
  spans: readonly TargetSpan[],
): Map<number, string> {
  const chosen = new Map<number, string>();
  if (fingering === null) return chosen;
  for (const span of spans) {
    for (let at = span.first; at <= span.last; at++) {
      const unit = fingering.units[at - span.first];
      if (unit != null) chosen.set(at, unit.roman);
    }
  }
  return chosen;
}

/**
 * 次に打つ文字を押す指を、決めた運指から引く。決めた運指の対象でなければ null
 * （呼び出し側は標準運指で出す）。
 *
 * 対象になるのは、苦無が的の中にあり、**そのかなを決めた打ち方で表示しているとき**だけ。
 * 別の打ち方で打ち始めた（`shi` と決めて `si` で打った）ら、表示も指も標準に戻る。
 * 打ち方と指は1文字ずつ対応しているので、表示が違う打ち方の指は使えない。
 */
export function chosenFingerAt(
  progress: TypingProgress,
  spans: readonly TargetSpan[],
  fingering: Fingering | null,
): Finger | null {
  if (fingering === null || progress.finished) return null;

  // 苦無の位置を「かな単位」と「その中の何文字目か」に直す。いまのかなを打ち終えて
  // 確定を保留している（「ん」の `n`）と、苦無は次のかなの1文字目を指している
  const segments = romanSegments(progress);
  let unit = progress.unitIndex;
  let offset = progress.input.length;
  while (unit < segments.length && offset >= (segments[unit]?.length ?? 0)) {
    offset -= segments[unit]?.length ?? 0;
    unit++;
  }

  const span = spans.find(({ first, last }) => first <= unit && unit <= last);
  if (span === undefined) return null;
  const chosen = fingering.units[unit - span.first];
  if (chosen == null || segments[unit] !== chosen.roman) return null;
  return chosen.fingers[offset] ?? null;
}
