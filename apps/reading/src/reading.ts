/**
 * Vibrato の出力（1トークン1行の `表層形\t特徴列`）から、読み仮名（ひらがな）を組み立てる。
 *
 * 特徴列は UniDic トリム辞書の並び: 品詞は1文字、活用・原形・発音は `*`、
 * 読み（出現形の正書法仮名、カタカナ）は index 7 に固定の9フィールド列。
 * 使うのは**読み**列（カタカナ、「ケイゾク」の形）だけ。発音・原形は載せていない。
 * タイピングで打つのは仮名なので、長音化した発音では「けーぞく」を打たされることになる。
 *
 * 未知語は特徴列が7列（読み・発音が無い）か、読みが `*` で来る。
 */

/**
 * 1回で受け付ける最大件数。1ラウンドの依頼数（N_REQUEST）より少し多め。
 * エントリ（index.ts）に named export を置くと workerd がハンドラと誤認して起動しないので、ここに置く
 */
export const MAX_TEXTS = 30;

export type ReadingResult =
  | { kana: string }
  /** 読みが引けない語（辞書に無い漢字語）が含まれる。呼び出し側はそのお題を却下する */
  | { error: "UNKNOWN_READING"; surface: string };

const READING_INDEX = 7;
const FEATURE_COLUMNS = 9;

function containsKanji(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

export function readingOf(
  tokenized: string,
  katakanaToHiragana: (text: string) => string,
): ReadingResult {
  const kana: string[] = [];
  for (const line of tokenized.split("\n")) {
    if (line === "") continue;
    const tab = line.indexOf("\t");
    const surface = line.slice(0, tab);
    const fields = line.slice(tab + 1).split(",");
    const reading = fields.length >= FEATURE_COLUMNS ? fields[READING_INDEX] : undefined;
    if (reading !== undefined && reading !== "*") {
      kana.push(katakanaToHiragana(reading));
      continue;
    }
    // 読みが無い語。かな・記号だけならそのまま打てる（Yahoo も漢字を含まない語には
    // ふりがなを返さなかった）。漢字を含むなら読みが分からないので却下
    if (containsKanji(surface)) return { error: "UNKNOWN_READING", surface };
    kana.push(katakanaToHiragana(surface));
  }
  return { kana: kana.join("") };
}
