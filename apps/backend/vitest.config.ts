import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// v0.22 から `@cloudflare/vitest-pool-workers/config` の defineWorkersConfig は無くなり、
// Viteプラグイン `cloudflareTest()` を使う（pool の設定と cloudflare:test の解決を両方やる）。
// vitest は apps/backend を作業ディレクトリとして起動するため相対パスでよい。
// （node:url の fileURLToPath は workerd の URL 型と衝突するので使わない）
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // テストではリモートバインディングを使わない。
      // wrangler.jsonc の AI バインディングは remote: true だが、これを持ち込むと
      // 起動時にリモートプロキシセッションを張るため CLOUDFLARE_API_TOKEN が必須になり、
      // CI（特にforkからのPR）でテストが動かせなくなる。
      remoteBindings: false,
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // テストは常に Yahoo 経路（globalThis.fetch の差し替えで応答を作る）を通す。
          // wrangler.jsonc の既定は shadow で、読み Worker のバインディングはテスト環境に無い
          READING_PROVIDER: "yahoo",
        },
        // wrangler.jsonc の READING Service Binding が指すサービスのスタブ。
        // 無いと workerd が起動を拒否する。yahoo 経路では呼ばれない
        workers: [
          {
            name: "henge-reading",
            modules: true,
            script: `export default { fetch: () => new Response("reading stub", { status: 500 }) }`,
          },
        ],
      },
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
