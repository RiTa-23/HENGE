import { canGenerate, remainingNeurons } from "@henge/shared";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { canKickRefill } from "@/lib/api/rate-limit";
import { sessionStartSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** プレイ開始。匿名でも遊べる */
export async function POST(request: Request) {
  const parsed = sessionStartSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const userId = await currentUserId(request);
  const client = await backendClient();

  if (userId === null) {
    return relay(
      await client.sessions.start.$post({
        json: {
          themeId: parsed.data.themeId,
          form: parsed.data.form,
          offset: parsed.data.offset ?? 0,
        },
      }),
    );
  }

  // ログイン時: 残ニューロンを判定して、補充の許可フラグを作る。
  // **判定はNext.js、記録はHono**（docs/04-api.md）。usage の取得はレスポンスの
  // neuronsRemaining にも使うため、この1回で済ませ、Hono側では同じ値を引き直さない
  const usage = await client.usage[":userId"].$get({ param: { userId } });
  const { neurons } = (await usage.json()) as { count: number; neurons: number };

  const res = await client.sessions.start.$post({
    json: {
      themeId: parsed.data.themeId,
      form: parsed.data.form,
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
  return Response.json(withRemaining, res.ok ? undefined : { status: res.status });
}
