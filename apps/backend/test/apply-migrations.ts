import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { applyD1Migrations, env } from "cloudflare:test";

// 各テストファイルの実行前に、テスト用D1へ実際のマイグレーションを適用する。
// スキーマを手で書き写さないことで、マイグレーションとテストがずれないようにする。

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

const migrations = (env as TestEnv).TEST_MIGRATIONS;

// **キャストは「必ずある」と言い切る書き方なので、ここで実際に確かめる。**
// vitest.config.ts 側で渡すのをやめたりリネームしたりしても型は通ってしまい、
// undefined のまま進むと全テストが「no such table」の連鎖で落ちて原因が見えない。
if (migrations === undefined) {
  throw new Error(
    "TEST_MIGRATIONS が渡っていない。vitest.config.ts の miniflare.bindings を確認する",
  );
}

await applyD1Migrations(env.DB, migrations);
