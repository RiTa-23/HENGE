import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { checkPlayRecord } from "@/lib/api/play-record";
import { PLAY_TICKET_TTL_MS, verifyPlayTicket } from "@/lib/api/play-ticket";
import { limitRankingRegister } from "@/lib/api/rate-limit";
import { rankingRegisterSchema } from "@/lib/api/schema";
import { currentSession } from "@/lib/api/session";
import { rankingTicketSecret } from "@/lib/api/ticket-secret";

export const dynamic = "force-dynamic";

/**
 * ランキングの登録。認証必須で、**ユーザー名（表示名）が決まっていることが条件**
 * （ランキングに出す名前が無い）。閲覧は詳細ページがSSRで Hono を直接引くので、
 * 公開の GET は持たない（`docs/04-api.md`）。
 *
 * **記録はクライアントの申告ではなく、サーバーが打鍵ログを再生して出す。**
 * プレイチケット（出したお題の証明）の署名を確かめ、そのお題で打鍵ログを再生し、
 * 実時間と合うかを見てから Hono に渡す（`lib/api/play-record.ts`）。
 * チケットの使い捨ては Hono 側（KV）で見る。
 */
export async function POST(request: Request) {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");
  if (!session.user.displayName) {
    return errorResponse("FORBIDDEN", "ユーザー名を決めるとランキングに登録できます");
  }

  // 連打はここで弾く。入力検証や Hono の照会より先に判定する
  const limited = await limitRankingRegister(session.user.id);
  if (limited !== null) return limited;

  const parsed = rankingRegisterSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "記録の形式が正しくありません");

  const secret = await rankingTicketSecret();
  if (secret === null) return errorResponse("FORBIDDEN", "ランキングの登録は準備中です");

  const now = Date.now();
  const verified = await verifyPlayTicket(parsed.data.ticket, secret, {
    now,
    userId: session.user.id,
  });
  if ("rejection" in verified) return errorResponse("FORBIDDEN", verified.rejection);
  const { ticket } = verified;

  const client = await backendClient();
  const found = await client.rankings.prompts.$post({ json: { ids: ticket.promptIds } });
  const { prompts } = await found.json();

  const record = checkPlayRecord({ ticket, log: parsed.data.log, prompts, now });
  if ("code" in record) return errorResponse(record.code, record.message);

  const res = await client.rankings.$post({
    json: {
      userId: session.user.id,
      themeId: ticket.themeId,
      form: ticket.form,
      stats: record.stats,
      ticketId: ticket.jti,
      ticketTtlSeconds: Math.ceil((ticket.iat + PLAY_TICKET_TTL_MS - now) / 1000),
    },
  });
  return relay(res);
}
