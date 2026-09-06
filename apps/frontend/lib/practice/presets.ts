import { isHiraganaOnly } from "@henge/shared";

/**
 * 運営が用意する最適化のプリセット。
 *
 * **最適化は「苦手な音の克服」ではない。** 標準運指をあえて崩し、特定の連接を
 * より速く打てる指使いに置き換える上級者向けの技術で、身につけるには
 * その連接を繰り返し打って新しい指の運びを定着させる必要がある。
 * 文言を「苦手」「詰まる」の側に寄せると、対象読者に届かなくなる。
 *
 * **並べるのは、標準運指で同じ指が連続する組み合わせ。** 同じ指が続くと必ず
 * 一度指を戻すことになって遅くなるため、別々の指が続くように運指を変える
 * 価値がある。これが最適化の代表例で、プリセットの選定基準でもある。
 *
 * **自由入力よりプリセットを主役に置く。** 自由入力は指定が分散してプールが増え、
 * 生成上限の消費が大きい。プリセットに集めるとプールを共有でき、
 * 「他の人が作った分をそのまま遊べる」状態になりやすい。
 *
 * **ひらがなだけを並べる。** 判定は読み仮名（ひらがな）に対して行うため、
 * カタカナ・長音符「ー」・漢字は何にも一致せず、生成が永久に失敗する。
 * 実際に弾かれるのはAPIの入口だが、**ここに混ざると画面上は普通のボタンに見えて、
 * 押した人だけがエラーに当たる**。presets.test.ts で機械的に検査している。
 */
export interface Preset {
  /** 指定する文字（1〜4文字） */
  char: string;
  /** なぜ最適化の対象になるか。一覧に短く添える */
  reason: string;
}

export const PRESETS: Preset[] = [
  { char: "ざ", reason: "za は左小指が続く" },
  { char: "き", reason: "ki は右中指が続く" },
  { char: "で", reason: "de は左中指が続く" },
];

/** そのプリセットがまだ生成されていないとき、作成フォームへ渡すためのリンク */
export function presetCreateHref(char: string): string {
  return `/practice?char=${encodeURIComponent(char)}#create`;
}

/** プリセットとして成立する文字か。テストと、将来の追加時の自己検査に使う */
export function isValidPreset({ char }: Preset): boolean {
  return char.length >= 1 && char.length <= 4 && isHiraganaOnly(char);
}
