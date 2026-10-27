import { type FingerName, fingerOf } from "@/lib/play/fingers";

/**
 * 説明ページ用の小さなキーボード（文字の3段だけ）。プレイ画面の `Keyboard` は
 * 数字段と Shift まで持ち、狭い画面に2枚並べられない。
 *
 * **塗りの約束はプレイ画面と同じ**（押すキーは橙で面を塗る）。説明で見た色が、
 * プレイ中に同じ意味で光るようにする。
 */

/**
 * 段ごとの字と字下げ。**プレイ画面の `Keyboard` と同じく、下の段ほど半キーずつ右へずらす**
 * （`Q` → `A` → `Z` が斜めに並ぶ）。キーの間隔は 24px ＋ 隙間 4px ＝ 28px、大きい図は 36px ＋ 4px ＝ 40px
 */
const ROWS: { keys: string; indent: string; indentLarge: string }[] = [
  { keys: "QWERTYUIOP", indent: "", indentLarge: "" },
  { keys: "ASDFGHJKL", indent: "pl-[14px]", indentLarge: "pl-[14px] sm:pl-5" },
  { keys: "ZXCVBNM", indent: "pl-7", indentLarge: "pl-7 sm:pl-10" },
];

/**
 * 指ごとの塗り。**色相を足さず、生成りの濃さで分ける**（4色の制約。docs/07-ui.md「配色」）。
 * 人差し指をいちばん濃く、小指は縁だけにして、ホームポジションから外へ向かって薄れる形にする。
 * 段差を大きく取る（濃さが近いと隣の指と見分けられない）。
 * 手の図の凡例（`FingerLegend`）も同じ塗りを使う。
 */
export const FINGER_TINT: Record<Exclude<FingerName, "thumb">, string> = {
  index: "bg-kinari/80 border-kinari/80 text-sumi",
  middle: "bg-kinari/45 border-kinari/45 text-sumi",
  ring: "bg-kinari/15 border-kinari/25 text-kinari",
  pinky: "bg-transparent border-kinari/30 text-kinari/70",
};

/** ホームポジションの印（指を置くと突起が触れるキー） */
const HOME = new Set(["F", "J"]);

/**
 * `press` は今押すキー（橙で塗る）、`mark` はこれから／さっき押すキー（橙の縁だけ）、
 * `ring` は指の塗りの上に橙の縁を重ねる（指ごとの塗りの図で、例の列を示す）
 */
export type MiniKeyState = "idle" | "press" | "mark" | "ring";

function keyClass(state: MiniKeyState, tint: string | null): string {
  if (state === "press") return "border-daidai bg-daidai font-bold text-sumi";
  if (state === "mark") return "border-daidai bg-transparent text-daidai";
  if (tint !== null) {
    return state === "ring" ? `${tint} outline-2 outline-offset-1 outline-daidai` : tint;
  }
  return "border-kinari/10 bg-kinari/5 text-kinari/50";
}

export function MiniKeyboard({
  states = {},
  tinted = false,
}: {
  /** キー（大文字）→ 状態。無いキーは idle */
  states?: Partial<Record<string, MiniKeyState>>;
  /** キーを受け持つ指ごとに塗る（標準運指の図）。大きめに描く */
  tinted?: boolean;
}) {
  const size = tinted ? "h-7 w-7 rounded sm:h-9 sm:w-9 sm:rounded-md" : "h-7 w-6 rounded";
  return (
    <div className="inline-flex flex-col gap-1" aria-hidden="true">
      {ROWS.map(({ keys, indent, indentLarge }) => (
        <div key={keys} className={`flex gap-1 ${tinted ? indentLarge : indent}`}>
          {[...keys].map((key) => {
            const finger = fingerOf(key);
            const tint =
              tinted && finger !== null && finger.finger !== "thumb"
                ? FINGER_TINT[finger.finger]
                : null;
            return (
              <span
                key={key}
                className={`relative flex items-center justify-center border font-mono transition-colors duration-150 ${size} ${keyClass(states[key] ?? "idle", tint)}`}
              >
                <span className={tinted ? "text-xs sm:text-sm" : "text-xs leading-none"}>
                  {key}
                </span>
                {HOME.has(key) && (
                  <span className="absolute bottom-0.5 h-px w-2 bg-current opacity-70" />
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
