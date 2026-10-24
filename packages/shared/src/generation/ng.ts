import { NG_WORDS } from "./ng-words";

/**
 * 生成したお題に NG 語（`NG_WORDS`）が入っているか。**最適化・テーマの全形式で使う。**
 *
 * **1文字の NG 語は見ない。** 部分一致にすると「盲」が「盲点」、「裸」が「裸足」まで
 * 落とす。1文字の語は最適化の共通語彙リストからは外してあるので、最適化では
 * そもそも渡さない。テーマでモデルが単独で書いた場合だけ素通りする。
 *
 * **カタカナだけの NG 語は、カタカナの連なり全体と一致したときだけ当てる。**
 * ただの部分一致だと「イク」が「バイク」「マイク」、「カス」が「カステラ」、
 * 「エロ」が「ピエロ」に当たり、共通語彙リストだけで88語が巻き込まれた（実測）。
 * カタカナは連なり自体がおおむね1語になるので、前後にカタカナが続かないことを
 * 条件にすれば外来語の中では当たらない。巻き込みは「ちびっこ」「ぱちんこ」の2語に減る
 * （どちらもひらがなの NG 語の部分一致で、こちらは助詞が続く書き方を拾うため緩めない）。
 */
const KATAKANA_ONLY = /^[ァ-ヺー]+$/u;

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const PATTERN = new RegExp(
  NG_WORDS.filter((word) => [...word].length >= 2)
    .map((word) =>
      KATAKANA_ONLY.test(word) ? `(?<![ァ-ヺー])${escape(word)}(?![ァ-ヺー])` : escape(word),
    )
    .join("|"),
  "u",
);

export function containsNgWord(text: string): boolean {
  return PATTERN.test(text);
}
