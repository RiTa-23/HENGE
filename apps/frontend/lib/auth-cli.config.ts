import { createAuth } from "@/lib/auth";

/**
 * `@better-auth/cli generate` に渡す設定。**アプリからは import しない。**
 *
 * `packages/shared/src/db/auth-schema.ts` は CLI の出力で、手で書かない
 * （`docs/03-data-model.md`）。CLI は `auth` を export したファイルを要求するが、
 * 本物の `createAuth` は Cloudflare の env（D1 バインディング）を引数に取るので、
 * ここで**中身の無い env を渡して**同じ設定のインスタンスを作る。スキーマの生成に
 * DB 接続は要らず、`additionalFields` などの定義だけが読まれる。
 *
 * 別の設定を書き写さないのは、`lib/auth.ts` に列を足したときに、こちらの更新を
 * 忘れて**本番とスキーマがずれる**のを防ぐため。
 *
 * 実行: `bun run auth:schema`（`apps/frontend`）
 */
export const auth = createAuth({
  DB: {} as never,
  GOOGLE_CLIENT_ID: "cli",
  GOOGLE_CLIENT_SECRET: "cli",
  BETTER_AUTH_URL: "http://localhost:3000",
  // 秘密鍵が短いと警告が出るだけで、生成には影響しない
  BETTER_AUTH_SECRET: "cli".repeat(11),
} as never);
