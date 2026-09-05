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

function keyClass(state: "idle" | "candidate" | "modifier"): string {
  const base =
    "flex h-11 min-w-11 items-center justify-center rounded-md border px-3 font-mono text-sm transition-colors";
  if (state === "candidate") {
    // 候補違い（どちらか一方を押す）はすべて同じ強さで光らせる
    return `${base} border-shu bg-shu/20 text-kinari shadow-[0_0_10px_var(--color-shu)]`;
  }
  if (state === "modifier") {
    // 修飾キー（両方同時に押す）は別扱い。破線にして「単独では押さない」を示す
    return `${base} border-2 border-dashed border-shu bg-transparent text-shu`;
  }
  return `${base} border-kinari/10 bg-kinari/5 text-kinari/60`;
}

interface KeyboardProps {
  /** 次に打てるキー。複数あるときは「どれか一方」を押す */
  nextKeys: NextKey[];
}

export function Keyboard({ nextKeys }: KeyboardProps) {
  const lit = new Set(nextKeys.map((next) => next.key));
  const needsShift = nextKeys.some((next) => next.shift);

  return (
    <div className="flex flex-col items-center gap-1.5">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {row.map((key, keyIndex) => {
            const state =
              key === "Shift"
                ? needsShift
                  ? "modifier"
                  : "idle"
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
