import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * **配色4色と書体3種の @theme トークン以外を使わない**（不変条件9）。
 *
 * 生の16進数値や `bg-blue-600` のような汎用色が1つ混ざるだけで、
 * 「朱＝今すぐ打つべきもの」という色の意味が薄まる。レビューで毎回見るのは
 * 現実的でないので機械的に弾く。濃淡が要るときは色を足さず、
 * `bg-kinari/5` のように不透明度で作ること。
 *
 * 16進数値の定義そのものは globals.css の @theme にしか無いので、
 * そのファイルだけ検査から外す。
 */

const ROOTS = [join(import.meta.dir, "../../app"), join(import.meta.dir, "../../components")];

/** Tailwind の汎用カラーパレット。HENGE では1つも使わない */
const GENERIC_COLORS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const GENERIC_COLOR_CLASS = new RegExp(
  `\\b(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret|divide|placeholder)-(?:${GENERIC_COLORS})-\\d{2,3}\\b`,
);
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(entry.name) && entry.name !== "globals.css" ? [path] : [];
  });
}

const files = ROOTS.flatMap((root) => sourceFiles(root));

describe("色は @theme トークンだけを使う", () => {
  it("検査対象のファイルがある", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s に生の16進数値が無い", (file) => {
    const hit = HEX_COLOR.exec(readFileSync(file, "utf8"));

    expect(hit?.[0] ?? null).toBeNull();
  });

  it.each(files)("%s に汎用カラーのクラスが無い", (file) => {
    const hit = GENERIC_COLOR_CLASS.exec(readFileSync(file, "utf8"));

    expect(hit?.[0] ?? null).toBeNull();
  });
});
