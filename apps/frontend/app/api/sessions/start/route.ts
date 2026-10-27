import { canGenerate, type PromptForm, remainingNeurons } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { signPlayTicket } from "@/lib/api/play-ticket";
import { canKickRefill } from "@/lib/api/rate-limit";
import { sessionStartSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";
import { rankingTicketSecret } from "@/lib/api/ticket-secret";

export const dynamic = "force-dynamic";

/** プレイ開始。匿名でも遊べる */
export async function POST(request: Request) {
  const parsed = sessionStartSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const userId = await currentUserId(request);
  const client = await backendClient();
  const { themeId, form } = parsed.data;

  if (userId === null) {
    const res = await client.sessions.start.$post({
      json: { themeId, form, offset: parsed.data.offset ?? 0 },
    });
    const body = await res.json();
    if (!res.ok) return Response.json(body, { status: res.status });
    return Response.json(await withTicket(body, { themeId, form, userId }));
  }

  // ログイン時: 残ニューロンを判定して、補充の許可フラグを作る。
  // **判定はNext.js、記録はHono**（docs/04-api.md）。usage の取得はレスポンスの
  // neuronsRemaining にも使うため、この1回で済ませ、Hono側では同じ値を引き直さない
  const usage = await client.usage[":userId"].$get({ param: { userId } });
  const { neurons } = (await usage.json()) as { count: number; neurons: number };

  const res = await client.sessions.start.$post({
    json: {
      themeId,
      form,
      userId,
      // 残数0でもプレイは許可する（ニューロンを消費しない行為のため）。
      // 補充のキックだけ許可しない。レート制限も同じ畳み方にしてあり、
      // 弾かれてもプレイは通って補充だけスキップされる
      allowRefill: canGenerate(neurons) && (await canKickRefill(userId)),
    },
  });
  const body = await res.json();
  // **エラーでも残数を載せる。** 枯渇（THEME_EXHAUSTED）の画面から
  // 「お題を作り足す」に進めるため、そこに残ニューロンを出す必要がある
  const withRemaining = { ...body, neuronsRemaining: remainingNeurons(neurons) };
  if (!res.ok) return Response.json(withRemaining, { status: res.status });
  return Response.json(await withTicket(withRemaining, { themeId, form, userId }));
}

/**
 * 出したお題にプレイチケットを添える（`lib/api/play-ticket.ts`）。**匿名にも出す。**
 * ログイン前に遊んだ記録を、ログインしてから登録できるようにするため。
 *
 * お題IDは**シャッフル後の出題順**で署名する（打鍵ログはこの順で再生する）。
 * 鍵が未設定なら `ticket: null`。プレイはそのままでき、登録だけができない。
 */
async function withTicket<T extends object>(
  body: T,
  params: { themeId: string; form: PromptForm; userId: string | null },
): Promise<T & { ticket: string | null }> {
  const secret = await rankingTicketSecret();
  if (secret === null || !("prompts" in body) || !Array.isArray(body.prompts)) {
    return { ...body, ticket: null };
  }
  const ticket = await signPlayTicket(
    {
      v: 1,
      jti: crypto.randomUUID(),
      themeId: params.themeId,
      form: params.form,
      promptIds: (body.prompts as { id: string }[]).map((prompt) => prompt.id),
      iat: Date.now(),
      ...(params.userId === null ? {} : { uid: params.userId }),
    },
    secret,
  );
  return { ...body, ticket };
}
