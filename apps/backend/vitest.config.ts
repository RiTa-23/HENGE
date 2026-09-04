import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// v0.22 から `@cloudflare/vitest-pool-workers/config` の defineWorkersConfig は無くなり、
// Viteプラグイン `cloudflareTest()` を使う（pool の設定と cloudflare:test の解決を両方やる）。
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // テストではリモートバインディングを使わない。
      // wrangler.jsonc の AI バインディングは remote: true だが、これを持ち込むと
      // 起動時にリモートプロキシセッションを張るため CLOUDFLARE_API_TOKEN が必須になり、
      // CI（特にforkからのPR）でテストが動かせなくなる。
      remoteBindings: false,
    }),
  ],
});
