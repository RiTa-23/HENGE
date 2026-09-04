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
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
