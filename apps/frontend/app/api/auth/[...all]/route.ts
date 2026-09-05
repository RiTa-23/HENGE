import { createAuth } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Better Auth のすべてのルート（サインイン・コールバック・セッション取得等）を
 * Next.js の Route Handler に通す。OAuth プロバイダからのリダイレクトもここで受ける。
 */
const handler = async (request: Request) => {
  const { env } = await getCloudflareContext({ async: true });
  return createAuth(env).handler(request);
};

export const GET = handler;
export const POST = handler;
