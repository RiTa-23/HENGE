import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// v0.22 から `@cloudflare/vitest-pool-workers/config` の defineWorkersConfig は無くなり、
// Viteプラグイン `cloudflareTest()` を使う（pool の設定と cloudflare:test の解決を両方やる）。
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
