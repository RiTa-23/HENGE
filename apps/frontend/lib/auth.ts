import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "@henge/shared/db/auth-schema";
import { displayNameSchema } from "@/lib/api/schema";

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
    // **IPアドレスの記録を有効にしない。** プライバシーポリシー（app/privacy）で
    // 「IPアドレスは保存していません」と明言している。`advanced.ipAddress` を
    // 設定すると session.ip_address が埋まり始め、その記述が嘘になる。
    // 記録したくなったら、ポリシーを同じPRで直すこと。
    database: drizzleAdapter(db, { provider: "sqlite" }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // Googleプロバイダのみ。パスワードログインは持たない
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        /**
         * ユーザー名（表示名）。**Google の名前（`name`）とは別に持つ。** `name` は
         * 本名のことが多く、ランキングなど公開の場に勝手に出せない。利用者が自分で
         * 決めた名前だけを公開に使う。
         *
         * 未設定（NULL）は「まだ決めていない」の意味で、ログイン後に入力させる
         * （`components/DisplayNameGate.tsx`）。この列を足す前に登録した利用者も
         * NULL のままなので、同じ導線に乗る。
         *
         * 更新は Better Auth の `/api/auth/update-user` で行う（`authClient.updateUser`）。
         * そこが公開APIの入口なので、**検証はこの `validator.input` にかける**
         * （Route Handler を別に足すと、Better Auth のルートが検証なしで残る）。
         *
         * **この定義を変えたら `bun run auth:schema` でスキーマを再生成する**
         * （`packages/shared/src/db/auth-schema.ts` は手で書かない）。
         */
        displayName: {
          type: "string",
          required: false,
          input: true,
          validator: { input: displayNameSchema },
        },
      },
    },
    baseURL: env.BETTER_AUTH_URL,
    // **明示的に渡す。** 省略すると Better Auth は process.env を見にいくが、
    // Workers のシークレットは env バインディングであって process.env ではない。
    // 見つからないと既定の秘密鍵にフォールバックし、本番では起動時に例外になる
    secret: env.BETTER_AUTH_SECRET,
  });
}
