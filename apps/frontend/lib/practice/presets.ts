import { isHiraganaOnly } from "@henge/shared";

/**
 * 運営が用意する「最適化する音」のプリセット。
 *
 * **自由入力よりプリセットを主役に置く。** 自由入力は指定が分散してプールが増え、
 * 生成上限の消費が大きい。プリセットに集めるとプールを共有でき、
 * 「他の人が作った分をそのまま遊べる」状態になりやすい。
 *
 * **ひらがなだけを並べる。** 最適化する音の判定は読み仮名（ひらがな）に対して行うため、
 * カタカナ・長音符「ー」・漢字は何にも一致せず、生成が永久に失敗する。
 * 実際に弾かれるのはAPIの入口だが、**ここに混ざると画面上は普通のボタンに見えて、
 * 押した人だけがエラーに当たる**。presets.test.ts で機械的に検査している。
 */
export interface Preset {
  /** 指定する文字（1〜4文字） */
  char: string;
  /** なぜ苦手になりやすいか。一覧に短く添える */
  reason: string;
}

export const PRESETS: Preset[] = [
  { char: "ざ", reason: "左手小指の伸ばし" },
  { char: "ぎ", reason: "濁点つきの上段" },
  { char: "づ", reason: "du と打つ例外" },
  { char: "ぬ", reason: "左上の端で押しにくい" },
  { char: "へん", reason: "右端から左端への跳び" },
  { char: "しゃ", reason: "拗音の3文字打ち" },
  { char: "っ", reason: "子音を重ねる促音" },
  { char: "ん", reason: "n の数で迷う撥音" },
  { char: "ぴ", reason: "半濁点つきの上段" },
  { char: "を", reason: "頻度が低く指が覚えない" },
];

/** そのプリセットがまだ生成されていないとき、作成フォームへ渡すためのリンク */
export function presetCreateHref(char: string): string {
  return `/practice?char=${encodeURIComponent(char)}#create`;
}

/** プリセットとして成立する文字か。テストと、将来の追加時の自己検査に使う */
export function isValidPreset({ char }: Preset): boolean {
  return char.length >= 1 && char.length <= 4 && isHiraganaOnly(char);
}
