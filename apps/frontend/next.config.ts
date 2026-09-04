import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js が AGENTS.md / CLAUDE.md を自動生成しないようにする。
  // このリポジトリではルートの CLAUDE.md を手で管理している。
  agentRules: false,
};

export default nextConfig;

// `next dev` でも wrangler.jsonc のバインディング（Service Bindings など）を使えるようにする。
initOpenNextCloudflareForDev();
