import { applyD1Migrations, env } from "cloudflare:test";

// 各テストファイルの実行前に、実際のマイグレーションをテスト用D1へ適用する。
// スキーマを手で書き写さないことで、マイグレーションとテストがずれないようにする。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
