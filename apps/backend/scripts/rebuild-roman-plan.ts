import {
  buildRomanCandidates,
  countKeystrokes,
  isKeystrokeCountInRange,
  UnsupportedKanaError,
} from "@henge/shared";

/**
 * `table.ts` を変えたあと、保存済みのお題を作り直す計画を立てる。**純粋関数。**
 *
 * D1へのアクセスは呼び出し側（`rebuild-roman.ts`）に閉じる。ここを分けているのは、
 * **書き込む行の選び方こそテストしたい**部分だから。
 */

/** D1から読んだ1行 */
export type StoredPrompt = {
  id: string;
  readingKana: string;
  readingRomanJson: string;
  keystrokeCount: number;
};

/** 書き換えが要る行 */
export type ChangedPrompt = {
  id: string;
  readingKana: string;
  readingRomanJson: string;
  keystrokeCount: number;
  previousKeystrokeCount: number;
  /**
   * 作り直した結果、打鍵数が 10〜35 の外に出た行。
   * **書き換えはする**（古い値も同じだけ間違っている）。消すかどうかは人が決める。
   */
  outOfRange: boolean;
};

/** `table.ts` からかなを消したなどで、もう組み立てられない行 */
export type UnsupportedPrompt = { id: string; readingKana: string; missingKana: string };

export type RebuildPlan = {
  /** 見た行数 */
  scanned: number;
  /** いまの値と一致していて、触らなくてよい行数 */
  unchanged: number;
  changed: ChangedPrompt[];
  unsupported: UnsupportedPrompt[];
};

/**
 * **読み仮名から作り直して、いまの値と違う行だけを拾う。**
 *
 * 全行を書き直さないのは、D1の書き込みが**1日10万行**で、使い切るとその日は
 * D1へのクエリが全部落ちる（＝アプリが止まる）ため。`table.ts` の変更はふつう
 * 一部のかなにしか効かないので、差分だけなら実際の書き込みはほぼゼロになる。
 *
 * `readingRomanJson` と `keystrokeCount` は**必ず一緒に**作り直す。片方だけ直すと、
 * 画面に出る打鍵数と実際の打鍵数が食い違う。
 */
export function planRebuild(rows: readonly StoredPrompt[]): RebuildPlan {
  const changed: ChangedPrompt[] = [];
  const unsupported: UnsupportedPrompt[] = [];
  let unchanged = 0;

  for (const row of rows) {
    let roman: string[][];
    try {
      roman = buildRomanCandidates(row.readingKana);
    } catch (error) {
      if (error instanceof UnsupportedKanaError) {
        unsupported.push({
          id: row.id,
          readingKana: row.readingKana,
          missingKana: error.kana,
        });
        continue;
      }
      throw error;
    }

    const readingRomanJson = JSON.stringify(roman);
    const keystrokeCount = countKeystrokes(roman);
    if (readingRomanJson === row.readingRomanJson && keystrokeCount === row.keystrokeCount) {
      unchanged++;
      continue;
    }

    changed.push({
      id: row.id,
      readingKana: row.readingKana,
      readingRomanJson,
      keystrokeCount,
      previousKeystrokeCount: row.keystrokeCount,
      outOfRange: !isKeystrokeCountInRange(keystrokeCount),
    });
  }

  return { scanned: rows.length, unchanged, changed, unsupported };
}

/**
 * SQLの文字列リテラル。**単引用符を二重にする。**
 *
 * 値はローマ字候補のJSON（ASCIIのみ）とIDだけなので現状は素通りするが、
 * 組み立てた文をそのままD1へ投げるので、ここを省かない。
 */
export function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** 1行ぶんの UPDATE。読みは触らない（読みは正しく、そこから作り直しているため） */
export function updateStatement(row: ChangedPrompt): string {
  return (
    `UPDATE prompts SET reading_roman_json = ${sqlText(row.readingRomanJson)}, ` +
    `keystroke_count = ${row.keystrokeCount} WHERE id = ${sqlText(row.id)};`
  );
}
