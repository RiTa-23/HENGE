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

/** 共通リストの語数。テストで上限を検査する（膨らんでメモリの心配を始めないため） */
export function vocabularySize(): number {
  return VOCABULARY_TSV.split("\n").length;
}
