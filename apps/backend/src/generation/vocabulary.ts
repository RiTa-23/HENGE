import { includesConstraint } from "@henge/shared";
import { VOCABULARY_TSV } from "./vocabulary.generated";

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
    words.push({ text: line.slice(0, tab), reading });
    if (words.length >= limit) break;
  }
  return words;
}

/**
 * ごちゃまぜで使う語の数。**共通リストの上から（よく使われる順に）この語数だけ使う。**
 *
 * ごちゃまぜは「とりあえず遊びたい人」向けなので、知らない語の組で文が不自然になるのを
 * 避ける。共通リストの下のほうは zipf 2.0 前後の珍しい語で、ランダムな2語の組に入ると
 * 意味のつながらない文になりやすい（最適化の実測で、不自然な文の多くは語彙の側に原因が
 * あった。docs/05-generation.md）。
 */
export const MIX_VOCABULARY_SIZE = 5000;

let mixVocabularyCache: VocabularyWord[] | undefined;

/**
 * ごちゃまぜの語彙。共通リストの上から `MIX_VOCABULARY_SIZE` 語。**D1 には保存しない**
 * （どの連接も含ませないので最適化ごとの語彙と違って選び直す必要が無く、5000語の JSON を
 * 1行に持つ意味も無い）。分解は Worker の生存中1回だけ。
 */
export function mixVocabulary(): VocabularyWord[] {
  mixVocabularyCache ??= VOCABULARY_TSV.split("\n")
    .slice(0, MIX_VOCABULARY_SIZE)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { text: line.slice(0, tab), reading: line.slice(tab + 1) };
    });
  return mixVocabularyCache;
}

/** 共通リストの語数。テストで上限を検査する（膨らんでメモリの心配を始めないため） */
export function vocabularySize(): number {
  return VOCABULARY_TSV.split("\n").length;
}
