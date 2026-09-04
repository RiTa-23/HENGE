import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// vitest.config.ts で miniflare のバインディングとして渡しているものの型。
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
