/**
 * .dev.vars / `wrangler secret put` で設定するシークレットの型。
 *
 * `cloudflare-env.d.ts` は `wrangler types` の再生成対象のため、シークレット
 * （vars に書けない値）の型はここで interface merging によって足す。
 * 再生成で消える場所に書かないこと。
 */
interface CloudflareEnv {
  /** Google OAuth クライアント。Google Cloud Console で作る */
  readonly GOOGLE_CLIENT_ID: string;
  readonly GOOGLE_CLIENT_SECRET: string;
  /** セッションの署名鍵。`openssl rand -base64 32` 等で作る */
  readonly BETTER_AUTH_SECRET: string;
  /** Better Auth の baseURL。ローカルは http://localhost:3000 */
  readonly BETTER_AUTH_URL: string;
  /** 管理者のメールアドレス（カンマ区切り）。Next.js側の管理者判定に使う */
  readonly ADMIN_EMAILS: string;
}
