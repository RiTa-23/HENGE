import { canGenerate, quotaResetAt } from "@henge/shared";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { generationResponse } from "@/lib/api/generation";
import { limitGeneration } from "@/lib/api/rate-limit";
import { themeListQuerySchema, themeNameSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";
import { betaLimitation } from "@/lib/beta/beta";
import { canonicalFingering, decodeFingering, isDefaultFingering } from "@/lib/practice/fingering";

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

/** 新規作成。初回10問を同期生成するため認証が要る */
export async function POST(request: Request) {
  const userId = await currentUserId(request);
  if (userId === null) return errorResponse("UNAUTHORIZED");

  const parsed = themeNameSchema.safeParse(await request.json());

  // **ベータ版ではテーマの新規生成を弾く。** 最適化練習（kind: "constraint"）は公開済みなので
  // 通す。ベータ版利用者は既存プールのプレイと補充生成もできるため、
  // /api/prompts/regenerate と /api/sessions/start は通す。運営アカウントは制限しない
  // （lib/beta/beta.ts）。判定はレート制限やクォータの照会より前に置く（認可の決まり。
  // docs/04-api.md）。形が壊れた入力は kind が分からないのでテーマ側に倒す
  const isConstraint = parsed.success && parsed.data.kind === "constraint";
  if (!isConstraint && (await betaLimitation(request))) {
    return errorResponse("FORBIDDEN", "お題の生成は調整中です。既にあるお題は引き続き遊べます");
  }

  // 連打はここで弾く。クォータの取得（D1アクセス）より先に判定する
  const limited = await limitGeneration(userId);
  if (limited !== null) return limited;

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
      `本日の生成量を使い切りました。日本時間の朝9時（${quotaResetAt()}）にリセットされます`,
    );
  }

  // 作成時に決めた運指は、その最適化の既定の運指として保存する。**標準運指と同じなら
  // 送らない**（保存しておく意味が無く、localStorage の「既定と同じなら消す」と揃える）
  const { kind, name } = parsed.data;
  const fingering =
    parsed.data.kind === "constraint" && parsed.data.fingering !== undefined
      ? decodeFingering(parsed.data.fingering, name)
      : null;
  const defaultFingering =
    fingering === null || isDefaultFingering(name, fingering)
      ? undefined
      : canonicalFingering(name, fingering);

  const res = await client.themes.$post({ json: { kind, name, userId, defaultFingering } });
  // 失敗でも、AIを呼んだあとならその回の消費を足した残ニューロンを返す
  return generationResponse(res, await res.json(), neurons);
}
