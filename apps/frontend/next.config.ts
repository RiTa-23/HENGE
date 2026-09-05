import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js が AGENTS.md / CLAUDE.md を自動生成しないようにする。
  // このリポジトリではルートの CLAUDE.md を手で管理している。
  agentRules: false,
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
