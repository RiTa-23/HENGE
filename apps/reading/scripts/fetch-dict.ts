/**
 * 辞書（IPADIC、Vibrato がコンパイル済みで配布しているもの）を取得して `assets/` に置く。
 *
 * - 取得元は GitHub Release の**固定版**。辞書のバイナリ形式は Vibrato のバージョンに
 *   縛られるので（`MODEL_MAGIC`）、`packages/reading-wasm` の Vibrato と同じ系列の Release を使う
 * - sha256 を照合する。取得元が差し替わっても気づけるように
 * - **`COPYING` と `NOTICE` も一緒に展開する。** IPADIC のライセンスは
 *   「コピーには著作権表示と免責条項を必ず付ける」なので、辞書の横に原文のまま置く
 *
 * 使い方: `bun run dict:fetch`（apps/reading で）
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RELEASE = "v0.5.0";
const NAME = "ipadic-mecab-2_7_0";
const DOWNLOAD_URL = `https://github.com/daac-tools/vibrato/releases/download/${RELEASE}/${NAME}.tar.xz`;
const SHA256 = "4764f983b7c3a9e1cb6a5ee945e00558efd812980e0dad61224f63ee3b0475d9";

const assetsDir = new URL("../assets/", import.meta.url).pathname;

const response = await fetch(DOWNLOAD_URL);
if (!response.ok) throw new Error(`取得に失敗: ${response.status} ${DOWNLOAD_URL}`);
const archive = new Uint8Array(await response.arrayBuffer());

const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== SHA256) {
  throw new Error(
    `sha256 が一致しない。取得元が変わった可能性がある\n  expected ${SHA256}\n  actual   ${digest}`,
  );
}

const work = await mkdtemp(join(tmpdir(), "henge-dict-"));
try {
  await Bun.write(join(work, "dict.tar.xz"), archive);
  // tar は macOS / ubuntu どちらも xz を解ける
  const tar = Bun.spawn(["tar", "xf", "dict.tar.xz"], {
    cwd: work,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await tar.exited) !== 0) throw new Error("tar の展開に失敗");

  const files = [
    ["system.dic.zst", "ipadic.dic.zst"],
    ["COPYING", "COPYING"],
    ["NOTICE", "NOTICE"],
  ] as const;
  await Promise.all(
    files.map(async ([from, to]) =>
      Bun.write(join(assetsDir, to), await readFile(join(work, NAME, from))),
    ),
  );
} finally {
  await rm(work, { recursive: true, force: true });
}

console.log(`assets/ipadic.dic.zst, COPYING, NOTICE を置いた（${NAME} @ ${RELEASE}）`);
