import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { applyD1Migrations, env } from "cloudflare:test";

/**
 * テスト用D1に、実際のマイグレーションを適用する（各テストファイルの実行前）。
 * スキーマを手で書き写さないことで、マイグレーションとテストがずれないようにする。
 */

/**
 * `vitest.config.ts` の `miniflare.bindings` で渡している、**テストのときだけ存在する値**。
 *
 * **グローバルの `Cloudflare.Env` に足さない。** `interface` は同名で宣言すると
 * マージされ、`declare global` ならプロジェクト全体に効く。
 * `worker-configuration.d.ts` の `export const env: Cloudflare.Env` を通じて、
 * **本番のコードからも `env.TEST_MIGRATIONS` が型として通ってしまう**
 * （実行時には存在しないので undefined になる）。
 *
 * 受け取りたいのはここ1か所なので、ここで広げる。
 */
type TestEnv = typeof env & { TEST_MIGRATIONS: D1Migration[] };

await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
