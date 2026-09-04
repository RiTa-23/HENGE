import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

function notConnected(): never {
  throw new Error(
    "apps/frontend/lib/auth.ts はスキーマ生成専用です。D1への接続は Phase 5（#41）で実装してください。",
  );
}

/**
 * まだD1に繋がっていないことを、使われた瞬間に分かる形で示すためのダミー。
 *
 * 素の `{}` を渡すと「設定済みに見えるが実際には何も保存されない」状態になり、
 * ログインは通るのにセッションが保持されない、という気付きにくい壊れ方をする。
 *
 * `@better-auth/cli generate` はDBに触らないため、初期化時に読まれる `db._?.schema`
 * だけを通し、それ以外のアクセスは全て失敗させている。
 */
const schemaOnlyDatabase = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === "_") {
        return {
          schema: undefined,
          get fullSchema(): never {
            return notConnected();
          },
        };
      }
      return notConnected();
    },
  },
);

/**
 * Better Auth の設定。認証は Next.js Worker 側にのみ置く。
 *
 * Phase 2 時点ではスキーマ生成（@better-auth/cli generate）のためだけに存在する。
 * D1への接続方法・Googleプロバイダの設定は Phase 5（#41）で入れる。
 */
export const auth = betterAuth({
  database: drizzleAdapter(schemaOnlyDatabase, { provider: "sqlite" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  emailAndPassword: { enabled: false },
});
