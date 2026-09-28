/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initSync, Reader } from "@henge/reading-wasm";
import { katakanaToHiragana } from "@henge/shared";
import { readingOf } from "./reading";

/**
 * 実物の辞書（Release から取得したシステム辞書＋ユーザー辞書）で読み Worker の
 * 解析が動くことの疎通テスト。
 *
 * **ユーザー辞書の中身（どの誤読が直るか・複合語を壊さないか）はここで見ない。**
 * それは辞書リポジトリ（RiTa-23/unidic-cwj-trim）の CI が、行を足す PR の時点で見る。
 * HENGE の CI が外部の可変データの中身で落ちると、辞書の更新のたびに無関係な PR が
 * 止まる（#209・#232 はその対応だけの PR だった）。ここで見るのは HENGE が壊れない
 * ための最小限: **取得したユーザー辞書を読み込めるか**（読めないと読み Worker が
 * 起動のたびに落ち、生成が全滅する）と、解析の結果を組み立てられるか。
 */

const assetsDir = fileURLToPath(new URL("../assets/", import.meta.url));
const dictPath = `${assetsDir}unidic.dic.zst`;
const userLexPath = `${assetsDir}user-lex.csv`;

function kanaOf(reader: Reader, text: string): string {
  const result = readingOf(reader.tokenize(text), katakanaToHiragana);
  if ("error" in result) throw new Error(`UNKNOWN_READING: ${result.surface} (${text})`);
  return result.kana;
}

// 辞書は git 管理外（bun run --cwd apps/reading dict:fetch で取得）。無い環境では飛ばす
const describeWithDict = existsSync(dictPath) && existsSync(userLexPath) ? describe : describe.skip;

describeWithDict("実物の辞書での解析", () => {
  initSync({
    module: readFileSync(
      fileURLToPath(
        new URL("../../../packages/reading-wasm/pkg/reading_wasm_bg.wasm", import.meta.url),
      ),
    ),
  });
  const dictZst = new Uint8Array(readFileSync(dictPath));
  const userCsv = readFileSync(userLexPath, "utf8");

  test("取得したユーザー辞書を重ねて Reader を作れる（本番の起動と同じ）", () => {
    expect(() => Reader.from_zstd(dictZst, userCsv)).not.toThrow();
  });

  test("システム辞書の人名を復元して読める", () => {
    const reader = Reader.from_zstd(dictZst);
    expect(kanaOf(reader, "織田信長")).toBe("おだのぶなが");
  });

  test("辞書に無い漢字は UNKNOWN_READING として表層を返す", () => {
    const reader = Reader.from_zstd(dictZst);
    expect(readingOf(reader.tokenize("鬼滅の刃"), katakanaToHiragana)).toEqual({
      error: "UNKNOWN_READING",
      surface: "滅",
    });
  });

  test("不正なCSVは Err としてJS例外になる", () => {
    expect(() => Reader.from_zstd(dictZst, "garbage,row\n")).toThrow();
  });
});
