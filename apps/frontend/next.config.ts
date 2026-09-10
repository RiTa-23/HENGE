import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

/**
 * デプロイに自動で付く workers.dev のホスト。**正規のホストではない。**
 *
 * ここで完全一致を見る。`*.workers.dev` をまとめて弾くと、バージョンごとの
 * プレビューURL（`<version>-henge-frontend...`）まで本番へ飛んでしまい、
 * デプロイ前に本番と同じWorkerを確認する手段が無くなる。
 */
const WORKERS_DEV_HOST = "henge-frontend.rita-tifrt.workers.dev";

/** 正規のホスト。`BETTER_AUTH_URL` と同じ（OAuthのコールバックもこちら） */
const CANONICAL_ORIGIN = "https://henge.ritane.co";

const nextConfig: NextConfig = {
  // Next.js が AGENTS.md / CLAUDE.md を自動生成しないようにする。
  // このリポジトリではルートの CLAUDE.md を手で管理している。
  agentRules: false,

  /**
   * workers.dev のURLを正規のホストへ寄せる。
   *
   * **同じ中身が2つのホストで開ける状態を残さない。** テーマ詳細は検索からの
   * 着地ページ（docs/07-ui.md）なので、重複しているとそのまま評価が割れる。
   * ログインも通らない（Google OAuth のコールバックは正規のホストにしか無い）
   * ので、workers.dev は入口として機能しないURLでもある。
   *
   * **Cloudflareの管理画面では設定できない。** Redirect Rules は自分のゾーンに
   * しか置けず、`workers.dev` は自分のゾーンではない。管理画面でできるのは
   * workers.dev を無効化することだけで、それは到達不能にする設定であって
   * リダイレクトではない。だからWorker側（ここ）で返す。
   *
   * `permanent: true` は **308**（301ではない）。メソッドを保つので、
   * 万一 POST で叩かれても GET に化けない。
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: WORKERS_DEV_HOST }],
        destination: `${CANONICAL_ORIGIN}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

// `next dev` でも wrangler.jsonc のバインディング（Service Bindings など）を使えるようにする。
//
// **永続化先をリポジトリ直下に揃える。** 既定では各Workerの `.wrangler/state` が
// 使われるため、Next.js と Hono が別々のローカルD1を見ることになる。本番は
// 1つの D1（henge-db）を両Workerが共有するので、ローカルもそう揃えないと
// 「Honoでマイグレーションしたのに、認証テーブルが無い」状態になる。
// apps/backend の dev / db:migrate:local も同じ場所（--persist-to）を指している。
initOpenNextCloudflareForDev({ persist: { path: "../../.wrangler/state/v3" } });
