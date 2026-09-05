import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "@henge/shared/db/auth-schema";

/**
 * Better Auth のインスタンスを作る。**認証は Next.js Worker 側にのみ置く。**
 * Hono 側に Better Auth を実装しない（不変条件1）。
 *
 * リクエストスコープで Cloudflare の env から作る。module scope には置けない
 * （ビルド時の Node 環境では D1 バインディングに触れないため）。
 *
 * ここのD1アクセスは「D1へのアクセスはHono Workerに閉じる」の例外で、
 * **認証テーブル（user / session / account / verification）のみ**を渡している。
 * ビジネスデータは schema に含めない。Hono 経由でのみアクセスする。
 */
export function createAuth(env: CloudflareEnv) {
  const db = drizzle(env.DB, { schema: authSchema });
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // Googleプロバイダのみ。パスワードログインは持たない
    emailAndPassword: { enabled: false },
    baseURL: env.BETTER_AUTH_URL,
    // **明示的に渡す。** 省略すると Better Auth は process.env を見にいくが、
    // Workers のシークレットは env バインディングであって process.env ではない。
    // 見つからないと既定の秘密鍵にフォールバックし、本番では起動時に例外になる
    secret: env.BETTER_AUTH_SECRET,
  });
}
