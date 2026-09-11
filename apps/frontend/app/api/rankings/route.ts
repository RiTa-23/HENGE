import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { limitRankingRegister } from "@/lib/api/rate-limit";
import { rankingRegisterSchema } from "@/lib/api/schema";
import { currentSession } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/**
 * ランキングの登録。認証必須で、**ユーザー名（表示名）が決まっていることが条件**
 * （ランキングに出す名前が無い）。閲覧は詳細ページがSSRで Hono を直接引くので、
 * 公開の GET は持たない（`docs/04-api.md`）。
 *
 * 「そのプールを遊んだか」は Hono 側で見る。ログインユーザーの再生オフセットは
 * Hono にしか無い。
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
  if (!parsed.success) {
    // 範囲検査（playStatsRejection）の理由はそのまま出す。形の誤りは既定の文言でよい
    const issue = parsed.error.issues[0];
    return errorResponse(
      "VALIDATION_ERROR",
      issue?.code === "custom" ? issue.message : "記録の形式が正しくありません",
    );
  }

  const { themeId, form, hits, misses, elapsedMs } = parsed.data;
  const client = await backendClient();
  const res = await client.rankings.$post({
    json: { userId: session.user.id, themeId, form, stats: { hits, misses, elapsedMs } },
  });
  return relay(res);
}
