import type { AppType } from "@henge/backend";
import { ping } from "@henge/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hc } from "hono/client";

export const dynamic = "force-dynamic";

/**
 * Service Bindings（HTTP方式）+ Hono RPC の疎通確認。
 * ブラウザ → Next.js Worker → Hono Worker の往復を型付きで通す。
 */
export async function GET() {
  const { env } = await getCloudflareContext({ async: true });

  const client = hc<AppType>("http://backend", {
    fetch: env.BACKEND.fetch.bind(env.BACKEND),
  });

  const res = await client.health.$get();
  const backend = await res.json();

  return Response.json({
    frontend: { service: "henge-frontend", shared: ping("frontend"), ok: true },
    backend,
  });
}
