import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { constraintVocabularies } from "./schema";
import {
  CONSTRAINT_VOCABULARY_MIN,
  vocabularyFor,
  type VocabularyWord,
} from "../generation/vocabulary";

/** D1 に保存する形。`[表記, 読み]` の配列（キー名を繰り返さないぶん小さい） */
type StoredWord = [text: string, reading: string];

function encode(words: VocabularyWord[]): string {
  return JSON.stringify(words.map((word): StoredWord => [word.text, word.reading]));
}

function decode(json: string): VocabularyWord[] {
  return (JSON.parse(json) as StoredWord[]).map(([text, reading]) => ({ text, reading }));
}

/**
 * 語彙の挿入文。**実行しない。** 新規作成ではテーマ行・お題と同じバッチに入れるため、
 * 文だけを返す（`insertThemeWithPrompts`）。
 */
export function constraintVocabularyInsert(db: Db, themeId: string, words: VocabularyWord[]) {
  return db.insert(constraintVocabularies).values({ themeId, wordsJson: encode(words) });
}

/**
 * その最適化の語彙。**保存されていなければ共通リストから作って保存する。**
 *
 * 語彙を保存するようになる前に作られた最適化（本番の「ざ」）にも、最初の生成で
 * 語彙が入る。後入れのための手順を別に持たなくて済む。
 *
 * **作成時と同じ下限を見る。** 下限に届かない連接なら保存せずに空を返す（生成は AI を
 * 呼ばずに終わる）。新規作成では断る連接が、古い最適化からだけ少ない語の使い回しで
 * ニューロンを使うことになるため。
 */
export async function loadConstraintVocabulary(
  db: Db,
  theme: { id: string; name: string },
): Promise<VocabularyWord[]> {
  const [row] = await db
    .select({ wordsJson: constraintVocabularies.wordsJson })
    .from(constraintVocabularies)
    .where(eq(constraintVocabularies.themeId, theme.id));
  if (row !== undefined) return decode(row.wordsJson);

  const words = vocabularyFor(theme.name);
  if (words.length < CONSTRAINT_VOCABULARY_MIN) return [];
  // 補充と同期再生成が同時に来ても、どちらも同じ語彙を作るので先に入った方が残ればよい
  await constraintVocabularyInsert(db, theme.id, words).onConflictDoNothing();
  return words;
}
