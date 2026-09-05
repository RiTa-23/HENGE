import type { AppType } from "@henge/backend";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hc } from "hono/client";

/**
 * Hono Worker のクライアント。
 *
 * **HTTP方式の Service Bindings を使う。** RPC方式（WorkerEntrypoint）に変えると、
 * Hono RPC の型共有と Smart Placement の両方を失う。
 */
export async function backendClient() {
  const { env } = await getCloudflareContext({ async: true });
  return hc<AppType>("http://backend", {
    fetch: env.BACKEND.fetch.bind(env.BACKEND),
  });
}

/**
 * Hono の応答をそのまま返す。エラーの形式とステータスを翻訳し直さない。
 *
 * Hono RPC の戻り値は Workers の Response とは別の構造型なので、
 * 必要な2つだけを受け取る形にしている。
 */
export async function relay(res: {
  status: number;
  json: () => Promise<unknown>;
}): Promise<Response> {
  return Response.json(await res.json(), { status: res.status });
}
