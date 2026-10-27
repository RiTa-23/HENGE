/**
 * 運指。キーボードのキー（`Keyboard` の表示：大文字・記号）→ 押す指。
 *
 * **標準のタッチタイピング**（ホームポジション `F` `J`）に合わせる。表示するキーは
 * 数字段・QWERTY3段・`, . / -` だけで、この範囲はJIS配列とUS配列で位置が同じなので
 * 配列差を考えなくてよい（docs/06-typing-engine.md「記号」）。
 */

export type Hand = "left" | "right";
export type FingerName = "pinky" | "ring" | "middle" | "index" | "thumb";

export interface Finger {
  hand: Hand;
  finger: FingerName;
}

/** 列ごとに指が決まる。人差し指だけ2列を受け持つ */
const COLUMNS: { keys: string; finger: Finger }[] = [
  { keys: "1QAZ", finger: { hand: "left", finger: "pinky" } },
  { keys: "2WSX", finger: { hand: "left", finger: "ring" } },
  { keys: "3EDC", finger: { hand: "left", finger: "middle" } },
  { keys: "45RTFGVB", finger: { hand: "left", finger: "index" } },
  { keys: "67YUHJNM", finger: { hand: "right", finger: "index" } },
  { keys: "8IK,", finger: { hand: "right", finger: "middle" } },
  { keys: "9OL.", finger: { hand: "right", finger: "ring" } },
  { keys: "0P/-", finger: { hand: "right", finger: "pinky" } },
];

const FINGER_OF_KEY = new Map<string, Finger>(
  COLUMNS.flatMap(({ keys, finger }) => [...keys].map((key) => [key, finger] as const)),
);

/** キーを押す指。キーボードに無いキーは null */
export function fingerOf(key: string): Finger | null {
  return FINGER_OF_KEY.get(key) ?? null;
}

/**
 * 次に打つキーで使う指。
 *
 * **Shift は押すキーと反対の手の小指で押す。** 同じ手で Shift と `1` を押すと
 * 小指同士がぶつかり、ホームポジションから手が離れる。
 */
export interface FingerPlan {
  /** キーを押す指 */
  press: Finger;
  /** Shift を押す指。Shift が要らなければ null */
  shift: Finger | null;
}

/**
 * `chosen` を渡すと、キーの列で決まる指の代わりにそれで押す（最適化の運指。
 * `lib/practice/fingering.ts`）。Shift はそのときも押す指と反対の手の小指
 */
export function fingerPlan(key: string, shift: boolean, chosen?: Finger): FingerPlan | null {
  const press = chosen ?? fingerOf(key);
  if (press === null) return null;
  return {
    press,
    shift: shift ? { hand: opposite(press.hand), finger: "pinky" } : null,
  };
}

function opposite(hand: Hand): Hand {
  return hand === "left" ? "right" : "left";
}

const HAND_LABEL: Record<Hand, string> = { left: "左", right: "右" };
const FINGER_LABEL: Record<FingerName, string> = {
  pinky: "小指",
  ring: "薬指",
  middle: "中指",
  index: "人差し指",
  thumb: "親指",
};

/** 「左 人差し指」 */
export function fingerLabel({ hand, finger }: Finger): string {
  return `${HAND_LABEL[hand]} ${FINGER_LABEL[finger]}`;
}
