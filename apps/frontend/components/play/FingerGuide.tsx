import {
  type Finger,
  type FingerName,
  fingerLabel,
  fingerPlan,
  type Hand,
} from "@/lib/play/fingers";
import type { NextKey } from "./Keyboard";

/**
 * 指の並び（左手は小指から、右手は親指から）。高さは指の長さの見当で、
 * 親指をいちばん短くして手の形に読ませる
 */
const FINGERS: { finger: FingerName; height: string }[] = [
  { finger: "pinky", height: "h-6" },
  { finger: "ring", height: "h-8" },
  { finger: "middle", height: "h-9" },
  { finger: "index", height: "h-8" },
  { finger: "thumb", height: "h-4" },
];

type FingerState = "idle" | "press" | "shift";

/**
 * 指の見た目。**キーボードと同じ約束で塗る**（押す指は橙で面を塗る、Shift を押す指は
 * 破線）。手の図とキーボードで色の意味が違うと、どちらを見ればよいか迷う。
 */
function fingerClass(state: FingerState, height: string): string {
  const base = `w-3.5 rounded-t-full transition-colors ${height}`;
  if (state === "press") {
    return `${base} border border-daidai bg-daidai shadow-[0_0_10px_var(--color-daidai)]`;
  }
  if (state === "shift") return `${base} border-2 border-dashed border-daidai`;
  return `${base} border border-kinari/15 bg-kinari/5`;
}

function stateOf(hand: Hand, finger: FingerName, press: Finger | null, shift: Finger | null) {
  if (press?.hand === hand && press.finger === finger) return "press";
  if (shift?.hand === hand && shift.finger === finger) return "shift";
  return "idle";
}

function HandFigure({
  hand,
  press,
  shift,
}: {
  hand: Hand;
  press: Finger | null;
  shift: Finger | null;
}) {
  const fingers = hand === "left" ? FINGERS : FINGERS.toReversed();
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-end gap-1">
        {fingers.map(({ finger, height }) => (
          <span key={finger} className={fingerClass(stateOf(hand, finger, press, shift), height)} />
        ))}
      </div>
      {/* 手のひら。指を1つの手としてまとめて見せる */}
      <span className="mt-1 h-2 self-stretch rounded-b-lg border border-kinari/15 bg-kinari/5" />
    </div>
  );
}

/**
 * 運指ガイド。**次に打つキーを押す指**を、キーボードの下に左右の手の図で出す。
 *
 * キーボードの橙は「どのキーか」を示すが、「どの指で押すか」は示さない。
 * ホームポジションから打つ練習では、指が分かる方が直接役に立つ。
 * 文字でも「左 人差し指」と出す（色と形だけに頼らない）。
 *
 * **文字の欄は幅を固定する。** 指の名前の長さで手の図が左右に揺れると、
 * 打つたびに視線の置き場がずれる。
 */
export function FingerGuide({ nextKey }: { nextKey: NextKey | null }) {
  const plan = nextKey === null ? null : fingerPlan(nextKey.key, nextKey.shift);
  const press = plan?.press ?? null;
  const shift = plan?.shift ?? null;

  return (
    <div className="flex items-end justify-center gap-6">
      <HandFigure hand="left" press={press} shift={shift} />
      <p className="w-40 pb-1 text-center text-xs leading-relaxed tracking-widest text-kinari/60">
        {press === null ? (
          <span className="text-kinari/30">―</span>
        ) : (
          <>
            <span className="text-daidai">{fingerLabel(press)}</span>
            {shift !== null && (
              <span className="block text-kinari/50">Shift は{fingerLabel(shift)}</span>
            )}
          </>
        )}
      </p>
      <HandFigure hand="right" press={press} shift={shift} />
    </div>
  );
}
