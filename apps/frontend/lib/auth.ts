import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Better Auth の設定。認証は Next.js Worker 側にのみ置く。
 *
 * Phase 2 時点ではスキーマ生成（@better-auth/cli generate）のためだけに存在する。
 * D1への接続方法・Googleプロバイダの設定は Phase 5 で入れる。
 */
export const auth = betterAuth({
  // Phase 5 で実際のD1接続に差し替える。
  database: drizzleAdapter({}, { provider: "sqlite" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  emailAndPassword: { enabled: false },
});
