import { initSync, Reader } from "@henge/reading-wasm";
import wasmModule from "@henge/reading-wasm/reading_wasm_bg.wasm";
import { katakanaToHiragana } from "@henge/shared";
import { Hono } from "hono";
import { MAX_TEXTS, readingOf, type ReadingResult } from "./reading";

/**
 * 読み Worker。外部には公開しない。Hono Worker から Service Binding 経由でのみ呼ばれる。
 *
 * 辞書（UniDic cwj-3.1.1 トリム、zst 6.9MB → Wasm メモリ +84MB）を Wasm の中に持つので、
 * Hono Worker とは分けてある。同居させると、プレイやランキングを捌くアイソレートにも
 * 辞書のメモリと起動が乗る。
 */

/**
 * 辞書は初回リクエストで読み、アイソレートが生きている間は使い回す。
 * グローバルスコープでは読まない（起動 1 秒の制限に当たる）。
 * 並行した初回リクエストは同じ Promise を待つ。失敗したら次のリクエストでやり直す。
 */
let readerPromise: Promise<Reader> | undefined;

function getReader(env: Env): Promise<Reader> {
  readerPromise ??= loadReader(env).catch((error: unknown) => {
    readerPromise = undefined;
    throw error;
  });
  return readerPromise;
}

async function loadReader(env: Env): Promise<Reader> {
  initSync({ module: wasmModule });
  // ASSETS へのリクエストはパスだけ見られる。ホスト名は何でもよい
  const [dictResponse, userLexResponse] = await Promise.all([
    env.ASSETS.fetch("https://assets/unidic.dic.zst"),
    env.ASSETS.fetch("https://assets/user-lex.csv"),
  ]);
  if (!dictResponse.ok) throw new Error(`辞書が読めない: ${dictResponse.status}`);
  if (!userLexResponse.ok) throw new Error(`ユーザー辞書が読めない: ${userLexResponse.status}`);
  // zstd 圧縮のまま渡し、Wasm の中でストリーム展開する。
  // JS 側で展開すると展開済みバッファが JS と Wasm の両方にできて 128MB を超える
  return Reader.from_zstd(
    new Uint8Array(await dictResponse.arrayBuffer()),
    await userLexResponse.text(),
  );
}

const app = new Hono<{ Bindings: Env }>();

const routes = app
  .get("/health", (c) =>
    c.json({ service: "henge-reading", ok: true, loaded: readerPromise !== undefined }),
  )
  /**
   * 複数の文の読みをまとめて返す。件数と順序は入力と同じ。
   * Service Binding の呼び出しもサブリクエストに数えられるので、1件ずつ呼ばせない。
   */
  .post("/readings", async (c) => {
    const body = await c.req.json<{ texts?: unknown }>();
    const texts = body.texts;
    if (!Array.isArray(texts) || texts.some((text) => typeof text !== "string")) {
      return c.json({ error: "texts は string[]" }, 400);
    }
    if (texts.length > MAX_TEXTS) return c.json({ error: `texts は ${MAX_TEXTS} 件まで` }, 400);

    const reader = await getReader(c.env);
    const results: ReadingResult[] = (texts as string[]).map((text) =>
      readingOf(reader.tokenize(text), katakanaToHiragana),
    );
    return c.json({ results });
  });

export type AppType = typeof routes;

export default app;
