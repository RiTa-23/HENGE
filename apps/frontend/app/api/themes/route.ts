import { canGenerate, quotaResetAt, remainingNeurons } from "@henge/shared";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { limitGeneration } from "@/lib/api/rate-limit";
import { themeListQuerySchema, themeNameSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";
import { betaLimitation } from "@/lib/beta/beta";

export const dynamic = "force-dynamic";

/** テーマ／最適化する音の一覧。認証不要 */
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = themeListQuerySchema.safeParse(query);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  return relay(
    await client.themes.$get({
      query: {
        kind: parsed.data.kind,
        sort: parsed.data.sort,
        ...(parsed.data.limit === undefined ? {} : { limit: String(parsed.data.limit) }),
        ...(parsed.data.cursor === undefined ? {} : { cursor: String(parsed.data.cursor) }),
      },
    }),
  );
}

/** 新規作成。初回15問を同期生成するため認証が要る */
export async function POST(request: Request) {
  const userId = await currentUserId(request);
  if (userId === null) return errorResponse("UNAUTHORIZED");

  // **ベータ版では新しいお題の生成を弾く。** ベータ版利用者は既存プールのプレイと
  // 補充生成だけができるため、/api/prompts/regenerate と /api/sessions/start は通す。
  // 運営アカウントは制限しない（lib/beta/beta.ts）。判定はレート制限やクォータの
  // 照会より前に置く（認可の決まり。docs/04-api.md）
  if (await betaLimitation(request)) {
    return errorResponse("FORBIDDEN", "お題の生成は調整中です。既にあるお題は引き続き遊べます");
  }

  // 連打はここで弾く。クォータの取得（D1アクセス）より先に判定する
  const limited = await limitGeneration(userId);
  if (limited !== null) return limited;

  const parsed = themeNameSchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message);
  }

  const client = await backendClient();

  // 残ニューロンの判定はここ（Next.js側）。残っていなければ Hono を呼ばずに弾く。
  // 加算は Hono 側（AIを呼んだ分を、成否によらず記録する）
  const usage = await client.usage[":userId"].$get({ param: { userId } });
  const { neurons } = (await usage.json()) as { count: number; neurons: number };
  if (!canGenerate(neurons)) {
    return errorResponse(
      "QUOTA_EXCEEDED",
      `本日の生成量を使い切りました。日本時間の翌0時（${quotaResetAt()}）にリセットされます`,
    );
  }

  const res = await client.themes.$post({ json: { ...parsed.data, userId } });
  const body = await res.json();
  if (!res.ok) return Response.json(body, { status: res.status });

  // **その回の消費は Hono の応答（neuronsUsed）から受け取る。** D1をもう一度
  // 読み直すと、加算と読み直しの間に別の生成が挟まったときにずれる
  const { neuronsUsed } = body as { neuronsUsed?: number };
  return Response.json({
    ...body,
    neuronsRemaining: remainingNeurons(neurons + (neuronsUsed ?? 0)),
  });
}
