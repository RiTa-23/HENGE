import {
  buildRomanCandidates,
  containsReadingProneWord,
  countKeystrokes,
  includesConstraint,
  isKeystrokeCountInRange,
  type RomanCandidates,
} from "@henge/shared";
import { MIX_VOCABULARY_SIZE, MIX_ZIPF_MIN, VOCABULARY_TSV } from "./vocabulary.generated";

/**
 * 最適化練習の語彙。**共通リスト（全部の最適化で1本）から、読みの部分一致で取り出す。**
 *
 * モデルに「指定の音を含む語」を探させると、文頭に指定の音を置く・ひらがなの作り語を
 * 書く・同じ語を使い回す、に逃げる（本番「ざ」の28件がすべて「ざ」始まりで、作り語7件、
 * 実質10語前後だった。2026-10-24）。語はこちらで辞書から選んで渡し、モデルには文を
 * 作らせるだけにする（docs/05-generation.md）。
 *
 * 共通リストは `scripts/vocabulary/build.py` が UniDic と wordfreq から作り、よく使われる
 * 順に並べてある。**最適化ごとの語彙は作成時にここから選んで D1 に保存する**
 * （`constraint_vocabularies`）ので、生成のたびにこのリストを探すことはない。
 */

/** これに届かない連接は、語彙が足りず自然なお題を作れないので作成を断る */
export const CONSTRAINT_VOCABULARY_MIN = 100;

/**
 * 1つの最適化に保存する語の上限。**品質の歯止めも兼ねる。** よく使われる順に取るので、
 * 「き」（3,500語以上当たる）のような連接では、下のほうの珍しい語は選ばれない。
 */
export const CONSTRAINT_VOCABULARY_MAX = 1000;

export interface VocabularyWord {
  /** 表記（基本形） */
  text: string;
  /** 読み（ひらがな） */
  reading: string;
}

/**
 * 読みに指定の連接を含む語を、よく使われる順に最大 `limit` 語。
 *
 * 照合はお題の検証（`includesConstraint`）と同じ関数で行う。ずれると、渡した語が
 * 検証では指定の音を含まないと判定される。
 */
export function vocabularyFor(
  constraint: string,
  limit: number = CONSTRAINT_VOCABULARY_MAX,
): VocabularyWord[] {
  const words: VocabularyWord[] = [];
  for (const line of VOCABULARY_TSV.split("\n")) {
    const tab = line.indexOf("\t");
    const reading = line.slice(tab + 1);
    if (!includesConstraint(reading, constraint)) continue;
    const text = line.slice(0, tab);
    // 生成後の検査で必ず落ちる語を渡さない
    if (containsReadingProneWord(text)) continue;
    words.push({ text, reading });
    if (words.length >= limit) break;
  }
  return words;
}

/**
 * おまかせ・ごちゃまぜで使う語は、**zipf が `MIX_ZIPF_MIN`（3.5）以上の語。** 共通リストは zipf の高い順なので、
 * 先頭から `MIX_VOCABULARY_SIZE` 語がそれに当たる。どちらも `scripts/vocabulary/build.py` が閾値から書き出す
 * （リストに頻度の値を持たないため。語数を手で決めない）。
 *
 * どちらも「とりあえず遊びたい人」向けなので、知らない語で文が不自然になるのを
 * 避ける。共通リストの下のほうは zipf 2.0 前後の珍しい語で、ランダムな2語の組に入ると
 * 意味のつながらない文になりやすい（最適化の実測で、不自然な文の多くは語彙の側に原因が
 * あった。docs/05-generation.md）。3.5 は低頻度語（3 以下）と高頻度語（4 以上）の区切りの中間で、
 * 3.0 からは専門寄りの語（オーバーホール・ゼネコン）が混ざり始める。
 */
export { MIX_VOCABULARY_SIZE, MIX_ZIPF_MIN };

let mixVocabularyCache: VocabularyWord[] | undefined;

/**
 * おまかせ・ごちゃまぜの語彙（両方で共通）。zipf `MIX_ZIPF_MIN` 以上の語（共通リストの上から `MIX_VOCABULARY_SIZE` 語）。
 * **D1 には保存しない**（どの連接も含ませないので最適化ごとの語彙と違って選び直す必要が無く、数千語の JSON を
 * 1行に持つ意味も無い）。分解は Worker の生存中1回だけ。
 */
export function mixVocabulary(): VocabularyWord[] {
  mixVocabularyCache ??= VOCABULARY_TSV.split("\n")
    .slice(0, MIX_VOCABULARY_SIZE)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { text: line.slice(0, tab), reading: line.slice(tab + 1) };
    })
    .filter((word) => !containsReadingProneWord(word.text));
  return mixVocabularyCache;
}

/** その場で取り出した単語1つ。`PlayablePrompt` と同じ形（プレイ画面は区別しない） */
export interface DrawnWord {
  /** 語彙リスト上の位置から作る。**D1 の行ではない**（保存しないので） */
  id: string;
  text: string;
  readingKana: string;
  readingRoman: RomanCandidates;
}

/**
 * おまかせの単語。**語彙から `count` 語をその場でランダムに取り出す**（AI を使わず、プールにも積まない）。
 *
 * - 1回の中で同じ表記は出さない（同じ表記で読みの違う行が並んでいることがある）
 * - 打鍵数が単語の範囲外の語・ローマ字に組めない読みの語は飛ばす（生成した単語と同じ検査）
 * - 取り出しは部分的な Fisher–Yates。数千語の全体を混ぜない
 *
 * 語彙が足りなければ取れた分だけ返す（呼び出し側が判断する）。
 */
export function drawMixWords(
  words: VocabularyWord[],
  count: number,
  random: () => number = Math.random,
): DrawnWord[] {
  const indexes = words.map((_, index) => index);
  const seen = new Set<string>();
  const drawn: DrawnWord[] = [];
  for (let i = 0; i < indexes.length && drawn.length < count; i++) {
    const j = i + Math.floor(random() * (indexes.length - i));
    [indexes[i], indexes[j]] = [indexes[j] as number, indexes[i] as number];
    const index = indexes[i] as number;
    const word = words[index] as VocabularyWord;
    if (seen.has(word.text)) continue;
    let roman: RomanCandidates;
    try {
      roman = buildRomanCandidates(word.reading);
    } catch {
      continue;
    }
    if (!isKeystrokeCountInRange(countKeystrokes(roman), "word")) continue;
    seen.add(word.text);
    drawn.push({
      id: `vocab-${index}`,
      text: word.text,
      readingKana: word.reading,
      readingRoman: roman,
    });
  }
  return drawn;
}

/** 共通リストの語数。テストで上限を検査する（膨らんでメモリの心配を始めないため） */
export function vocabularySize(): number {
  return VOCABULARY_TSV.split("\n").length;
}
