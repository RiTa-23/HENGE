/**
 * キーボード表示。**4段＋Shift**（数字段・QWERTY3段・両端のShift）。
 * アルファベット3段では `！`（Shift+`1`）・`？`（Shift+`/`）・`ー`（`-`）が打てない。
 */

const ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
];

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
function keyClass(state: "idle" | "candidate" | "modifier" | "miss"): string {
  const base =
    "flex h-11 min-w-11 items-center justify-center rounded-md border px-3 font-mono text-sm transition-colors";
  if (state === "candidate") {
    // 候補違い（どちらか一方を押す）はすべて同じ強さで光らせる
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
  /** 次に打てるキー。複数あるときは「どれか一方」を押す */
  nextKeys: NextKey[];
  /**
   * 直前に打ち間違えたキー（キーボード上の表示）。少しのあいだ赤くする。
   *
   * 巻物の撒菱が「どこでつまずいたか」を残すのに対し、こちらは
   * **何を押してしまったか**をその場で返す。押した本人にしか分からない情報で、
   * 出さないと隣を叩いたのか別の指が動いたのかが判別できない。
   */
  missKey?: string | null;
}

export function Keyboard({ nextKeys, missKey = null }: KeyboardProps) {
  const lit = new Set(nextKeys.map((next) => next.key));
  const needsShift = nextKeys.some((next) => next.shift);

  return (
    <div className="flex flex-col items-center gap-1.5">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {row.map((key, keyIndex) => {
            // **ミスを候補より優先する。** 打ち間違えたキーが候補であることは
            // 無い（候補なら受理されている）ので、両方に該当することはない
            const state =
              key === "Shift"
                ? needsShift
                  ? "modifier"
                  : "idle"
                : key === missKey
                  ? "miss"
                  : lit.has(key)
                    ? "candidate"
                    : "idle";
            return (
              <span
                key={`${key}-${keyIndex}`}
                className={key === "Shift" ? `${keyClass(state)} w-20` : keyClass(state)}
              >
                {key}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
