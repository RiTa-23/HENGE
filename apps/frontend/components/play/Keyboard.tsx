import { fingerPlan, type Hand } from "@/lib/play/fingers";

/**
 * キーボード表示。**4段＋Shift**（数字段・QWERTY3段・両端のShift）。
 * アルファベット3段では `！`（Shift+`1`）・`？`（Shift+`/`）・`ー`（`-`）が打てない。
 */

/**
 * キーの並び。Shift だけは左右を名前で分ける（`ShiftLeft` / `ShiftRight`。
 * `KeyboardEvent.code` と同じ名前）。表示はどちらも「Shift」。
 *
 * **並びの位置で左右を決めない。** 「行頭が左」で決めると、行頭に別のキー
 * （`Caps` など）を足しただけで左の Shift が右と判定され、`？` で光るべき左が
 * 光らず、`！` で両方が光る。画面を見ないと気付けない壊れ方になる。
 */
export const ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ShiftLeft", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "ShiftRight"],
];

const SHIFT_SIDE: Record<string, Hand> = { ShiftLeft: "left", ShiftRight: "right" };

/** 打つべき1文字を、実際のキーと Shift の要否に落とす */
export interface NextKey {
  /** キーボード上の表示（大文字・記号） */
  key: string;
  /** Shift との同時押しが要るか */
  shift: boolean;
}

const SHIFTED: Record<string, string> = { "!": "1", "?": "/" };

/** ローマ字1文字 → 押すキー。`！` `？` だけ Shift を伴う */
export function toNextKey(letter: string): NextKey {
  const shifted = SHIFTED[letter];
  if (shifted !== undefined) return { key: shifted, shift: true };
  return { key: letter.toUpperCase(), shift: false };
}

/**
 * キーの見た目。**色でしか区別しない状態を作らない**（形と塗りも変える）。
 *
 * 次に打つキーは橙で、枠だけでなく**キーの面を塗る**。枠だけだと、視線が
 * 巻物とキーボードのあいだを往復する速さに追いつかない。文字は地の色に
 * 落として読ませる。
 */
export type KeyState = "idle" | "next" | "modifier" | "miss";

/**
 * キー1つの状態（`ROWS` の名前で渡す）。
 *
 * **光らせる Shift は押すキーと反対側の1つだけ**（`！` なら右、`？` なら左）。
 * 両方光らせると、運指ガイドの「反対の手の小指で Shift」と食い違う。
 * 光らせるのは案内だけで、判定はどちらの Shift で打っても通る（届く文字は同じ）。
 *
 * **次に打つキーをミスより優先する。** 打った瞬間は両方に該当しないが、
 * 赤が消える前に打ち直して先へ進むと、**さっき打ち間違えたキーが
 * 次に打つキーになる**ことがある（`し` の `h` を先に打ってから `s`
 * を打つと、次は `h`）。ここでミスを優先すると、いま押すべきキーが
 * 赤いままになり、この画面で消したかった混同がそのまま起きる。
 */
export function keyState(key: string, nextKey: NextKey | null, missKey: string | null): KeyState {
  const side = SHIFT_SIDE[key];
  if (side !== undefined) {
    const shiftHand = nextKey === null ? null : fingerPlan(nextKey.key, nextKey.shift)?.shift?.hand;
    return side === shiftHand ? "modifier" : "idle";
  }
  if (key === nextKey?.key) return "next";
  if (key === missKey) return "miss";
  return "idle";
}

function keyClass(state: KeyState): string {
  const base =
    "flex h-11 min-w-11 items-center justify-center rounded-md border px-3 font-mono text-sm transition-colors";
  if (state === "next") {
    return `${base} border-daidai bg-daidai font-bold text-sumi shadow-[0_0_12px_var(--color-daidai)]`;
  }
  if (state === "miss") {
    // 直前に打ち間違えたキー。**撒菱と同じ赤**にして「これはミス」と読ませる
    return `${base} border-makibishi bg-makibishi font-bold text-kinari shadow-[0_0_12px_var(--color-makibishi)]`;
  }
  if (state === "modifier") {
    // 修飾キー（両方同時に押す）は別扱い。破線にして「単独では押さない」を示す
    return `${base} border-2 border-dashed border-daidai bg-transparent text-daidai`;
  }
  return `${base} border-kinari/10 bg-kinari/5 text-kinari/60`;
}

interface KeyboardProps {
  /**
   * 次に打つキー。**巻物に出ている打ち方の1文字だけ**で、別の候補のキーは光らせない。
   * 打ち終えたら null
   */
  nextKey: NextKey | null;
  /**
   * 直前に打ち間違えたキー（キーボード上の表示）。少しのあいだ赤くする。
   *
   * 巻物の撒菱が「どこでつまずいたか」を残すのに対し、こちらは
   * **何を押してしまったか**をその場で返す。押した本人にしか分からない情報で、
   * 出さないと隣を叩いたのか別の指が動いたのかが判別できない。
   */
  missKey?: string | null;
}

export function Keyboard({ nextKey, missKey = null }: KeyboardProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {row.map((key) => {
            const isShift = SHIFT_SIDE[key] !== undefined;
            const state = keyState(key, nextKey, missKey);
            return (
              <span key={key} className={isShift ? `${keyClass(state)} w-20` : keyClass(state)}>
                {isShift ? "Shift" : key}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
