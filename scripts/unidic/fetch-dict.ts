/**
 * 辞書（UniDic cwj-3.1.1 の自前トリム版）を取得して `apps/reading/assets/` に置く。
 *
 * - 取得元は公開リポジトリ RiTa-23/unidic-cwj-trim の GitHub Release `unidic-cwj-trim-v1`。
 *   HENGE 本体が private 化されても辞書取得は無認証のまま動くよう、
 *   辞書アセットはあちらに置く。中身は `scripts/unidic/BUILD.md` の手順で自前ビルドしたもの
 * - sha256 を照合する。取得元が差し替わっても気づけるように
 * - ライセンス文も一緒に置く。UniDic cwj は GPL/LGPL/BSD のトリプルライセンスで、
 *   ここでは **BSD** を選択している（licses/COPYING 参照）。再頒布には BSD 条文と
 *   著作権表示の同梱が必要なので `LICENSE-BSD.unidic` / `COPYING.unidic` /
 *   `AUTHORS.unidic` を辞書の横に置く
 *
 * 使い方: `bun scripts/unidic/fetch-dict.ts`（リポジトリルートから）
 */
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";

const RELEASE = "unidic-cwj-trim-v1";
const BASE = `https://github.com/RiTa-23/unidic-cwj-trim/releases/download/${RELEASE}`;

/** [アセット名, assets内のファイル名, sha256] */
const FILES = [
  [
    "unidic-cwj-v7800n-slim2.dic.zst",
    "unidic.dic.zst",
    "aae2f56b6f88a2a6a2671a072248220166b708a1a4a8d2ffbff610d6c0d06d9f",
  ],
  // user-lex.csv は誤読修正のたびに更新されるアセットなので sha は固定しない。
  // 取り込まれた内容は apps/reading のテスト（誤読回帰・非破壊）が取得後に検査する
  ["user-lex.csv", "user-lex.csv", null],
  ["COPYING.unidic", "COPYING.unidic", null],
  ["LICENSE-BSD.unidic", "LICENSE-BSD.unidic", null],
  ["AUTHORS.unidic", "AUTHORS.unidic", null],
] as const;

const assetsDir = new URL("../../apps/reading/assets/", import.meta.url).pathname;
await mkdir(assetsDir, { recursive: true });

await Promise.all(
  FILES.map(async ([name, to, sha256]) => {
    const url = `${BASE}/${name}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`取得に失敗: ${response.status} ${url}`);
    const body = new Uint8Array(await response.arrayBuffer());
    if (sha256 !== null) {
      const digest = createHash("sha256").update(body).digest("hex");
      if (digest !== sha256) {
        throw new Error(`sha256 が一致しない: ${name}\n  expected ${sha256}\n  actual   ${digest}`);
      }
    }
    await Bun.write(`${assetsDir}${to}`, body);
    console.log(`assets/${to} (${body.byteLength} bytes)`);
  }),
);

console.log("完了: assets/unidic.dic.zst と UniDic ライセンス文を置いた");
