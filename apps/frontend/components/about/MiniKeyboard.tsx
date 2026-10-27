import { type FingerName, fingerOf } from "@/lib/play/fingers";

/**
 * 説明ページ用の小さなキーボード（文字の3段だけ）。プレイ画面の `Keyboard` は
 * 数字段と Shift まで持ち、狭い画面に2枚並べられない。
 *
 * **塗りの約束はプレイ画面と同じ**（押すキーは橙で面を塗る）。説明で見た色が、
 * プレイ中に同じ意味で光るようにする。
 */

/** 段ごとの字と字下げ。実物のキーボードと同じく、下の段ほど右へずらす */
const ROWS: { keys: string; indent: string }[] = [
  { keys: "QWERTYUIOP", indent: "" },
  { keys: "ASDFGHJKL", indent: "pl-2" },
  { keys: "ZXCVBNM", indent: "pl-6" },
];

const FINGER_SHORT: Record<FingerName, string> = {
  pinky: "小",
  ring: "薬",
  middle: "中",
  index: "人",
  thumb: "親",
};

/** ホームポジションの印（指を置くと突起が触れるキー） */
const HOME = new Set(["F", "J"]);

/** `press` は今押すキー（橙で塗る）、`mark` はこれから／さっき押すキー（橙の縁だけ） */
export type MiniKeyState = "idle" | "press" | "mark";

function keyClass(state: MiniKeyState): string {
  const base =
    "relative flex w-6 flex-col items-center justify-center rounded border font-mono transition-colors duration-150";
  if (state === "press") return `${base} border-daidai bg-daidai font-bold text-sumi`;
  if (state === "mark") return `${base} border-daidai bg-transparent text-daidai`;
  return `${base} border-kinari/10 bg-kinari/5 text-kinari/50`;
}

export function MiniKeyboard({
  states = {},
  fingers = false,
}: {
  /** キー（大文字）→ 状態。無いキーは idle */
  states?: Partial<Record<string, MiniKeyState>>;
  /** 各キーに受け持つ指（「中」）を添える */
  fingers?: boolean;
}) {
  return (
    <div className="inline-flex flex-col gap-1" aria-hidden="true">
      {ROWS.map(({ keys, indent }) => (
        <div key={keys} className={`flex gap-1 ${indent}`}>
          {[...keys].map((key) => {
            const finger = fingerOf(key);
            return (
              <span
                key={key}
                className={`${keyClass(states[key] ?? "idle")} ${fingers ? "h-10" : "h-7"}`}
              >
                <span className="text-xs leading-none">{key}</span>
                {fingers && finger !== null && (
                  <span className="mt-1 font-gothic text-[10px] leading-none opacity-70">
                    {FINGER_SHORT[finger.finger]}
                  </span>
                )}
                {HOME.has(key) && <span className="absolute bottom-0.5 h-px w-2 bg-kin" />}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
