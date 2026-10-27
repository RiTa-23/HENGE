import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * プレイチケットの署名鍵（`RANKING_TICKET_SECRET`）。**未設定なら null。**
 *
 * 未設定のときはチケットを発行せず（プレイはできる）、登録も受け付けない。
 * 空の鍵で署名すると、誰でも同じ署名を作れてしまう。
 */
export async function rankingTicketSecret(): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  return env.RANKING_TICKET_SECRET ? env.RANKING_TICKET_SECRET : null;
}
