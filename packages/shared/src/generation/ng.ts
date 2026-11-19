import { katakanaToHiragana } from "../typing/kana";
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

const SINGLE_CHAR_WORDS = new Set(NG_WORDS.filter((word) => [...word].length === 1));

/**
 * かなだけの NG 語を、ひらがなに揃えたもの。書き換え（チンコ／ちんこ、ペニス／ぺにす）を同じに見る。
 *
 * **ひらがなの連なりには、2文字のカタカナ語を当てない。** イク・カス・バカ・ハゲをひらがなで
 * 書いた「いく」「かす」は、最適化する音としては普通の音で、カタカナで書いたときだけ俗語になる
 */
const KANA_ONLY = /^[ぁ-ゖァ-ヺー]+$/u;
const KANA_WORDS_FOR_KATAKANA = new Set(
  NG_WORDS.filter((word) => KANA_ONLY.test(word)).map((word) => katakanaToHiragana(word)),
);
const KANA_WORDS_FOR_HIRAGANA = new Set(
  NG_WORDS.filter(
    (word) => KANA_ONLY.test(word) && (!KATAKANA_ONLY.test(word) || [...word].length >= 3),
  ).map((word) => katakanaToHiragana(word)),
);

/** ひらがなの連なりと、カタカナの連なり（それぞれ別に切る。長音符はどちらにも続く） */
const KANA_RUN = /[ぁ-ゖー]+|[ァ-ヺー]+/gu;
/** 語の途中とみなす直前の文字。漢字（送り仮名）と、別の字種のかな（「ピンぼけ」） */
const WORD_CHAR = /[\p{Script=Han}ぁ-ゖァ-ヺー]/u;

/**
 * 入力（テーマ名・最適化する音）に NG 語が入っているか。**お題用の `containsNgWord` より締める。**
 * お題は誤って落としても1件捨てるだけだが、入力は公開一覧に名前ごと載る。
 *
 * - **NFKC で揃えてから見る**（全角・半角の揺れ）
 * - **1文字の NG 語は、名前全体と一致したときだけ当てる**（「盲」は弾き、「盲点」は通す）
 * - **ひらがな・カタカナの書き換えで逃がさない。** かなの連なりが、かなだけの NG 語と
 *   表記を揃えて**丸ごと**一致したら当てる（「チンコ」「チンコの話」「ぺにす」）。
 *   部分一致にしないのは、外来語（「エッチング」の「えっち」、「ランデブー」の「でぶ」）に
 *   当たるため。**語の途中から始まる連なりは見ない**（送り仮名の「動かす」の「かす」、
 *   字種が混ざった「ピンぼけ」の「ぼけ」）
 */
export function containsNgWordInName(name: string): boolean {
  const normalized = name.normalize("NFKC").trim();
  if (SINGLE_CHAR_WORDS.has(normalized) || containsNgWord(normalized)) return true;
  for (const match of normalized.matchAll(KANA_RUN)) {
    const before = normalized[match.index - 1];
    if (before !== undefined && WORD_CHAR.test(before)) continue;
    const run = match[0];
    const words = KATAKANA_ONLY.test(run) ? KANA_WORDS_FOR_KATAKANA : KANA_WORDS_FOR_HIRAGANA;
    if (words.has(katakanaToHiragana(run))) return true;
  }
  return false;
}
