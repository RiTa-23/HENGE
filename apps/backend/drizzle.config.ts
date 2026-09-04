import { defineConfig } from "drizzle-kit";

// マイグレーションの「生成」だけに使う設定。適用は wrangler が行うため、
// D1への接続情報（driver: "d1-http"）はここに持たせない。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  // wrangler の migrations_dir の既定値と揃える
  out: "./migrations",
});
