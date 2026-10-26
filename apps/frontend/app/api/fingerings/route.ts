import { getCloudflareContext } from "@opennextjs/cloudflare";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { canDeleteFingeringPost } from "@/lib/api/fingering-guard";
import { limitFingeringPost } from "@/lib/api/rate-limit";
import { fingeringListQuerySchema, fingeringPostSchema } from "@/lib/api/schema";
import { currentSession } from "@/lib/api/session";
import { betaLimitation } from "@/lib/beta/beta";
import { decodeFingering, encodeFingering, isDefaultFingering } from "@/lib/practice/fingering";

export const dynamic = "force-dynamic";

/** Hono の一覧の1件。`userId` は公開しない */
interface InternalPost {
  id: string;
  userId: string;
  displayName: string | null;
  fingering: unknown;
  note: string | null;
  pickCount: number;
  createdAt: number;
}

/**
 * 最適化の運指の投稿一覧。認証不要（選んで使うだけなら匿名でもできる）。
 *
 * **投稿者のユーザーIDは返さない。** ログイン中なら、自分の投稿か（`mine`）と、
 * 消せるか（`deletable`。投稿者本人か運営）に畳んで返す。
 */
export async function GET(request: Request) {
  const parsed = fingeringListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  const res = await client.fingerings.$get({ query: { themeId: parsed.data.themeId } });
  const { posts } = (await res.json()) as { posts: InternalPost[] };

  const session = await currentSession(request);
  const { env } = await getCloudflareContext({ async: true });
  return Response.json({
    posts: posts.map((post) => ({
      id: post.id,
      displayName: post.displayName,
      fingering: post.fingering,
      note: post.note,
      pickCount: post.pickCount,
      createdAt: post.createdAt,
      mine: session !== null && session.user.id === post.userId,
      deletable: canDeleteFingeringPost(session, post.userId, env.ADMIN_EMAILS),
    })),
  });
}

/**
 * 運指を投稿する。認証必須で、**ユーザー名が決まっていることが条件**（一覧に投稿者名を
 * 出すため。ランキングと同じ）。
 *
 * 運指は最適化する音と照らし、**標準運指そのものは断る**（最適化ではない）。
 * 同じ運指が既にある・1人5件を超える、は Hono 側で数えて `VALIDATION_ERROR` で返る。
 */
export async function POST(request: Request) {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");
  if (!session.user.displayName) {
    return errorResponse("FORBIDDEN", "ユーザー名を決めると運指を投稿できます");
  }
  // **ベータ版では最適化練習ごと閉じている**ので、非運営は投稿できない
  if (await betaLimitation(request)) return errorResponse("FORBIDDEN", "最適化練習は調整中です");

  // 連投はここで弾く。入力検証や Hono の照会より先に判定する
  const limited = await limitFingeringPost(session.user.id);
  if (limited !== null) return limited;

  const parsed = fingeringPostSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "投稿の形式が正しくありません");
  const { themeId, fingering, note } = parsed.data;

  const client = await backendClient();
  const detail = await client.themes[":id"].$get({ param: { id: themeId } });
  if (!detail.ok) return errorResponse("NOT_FOUND", "最適化が見つかりません");
  const { theme } = (await detail.json()) as { theme: { kind: string; name: string } };
  if (theme.kind !== "constraint") {
    return errorResponse("VALIDATION_ERROR", "運指を投稿できるのは最適化練習だけです");
  }

  const decoded = decodeFingering(fingering, theme.name);
  if (decoded === null) return errorResponse("VALIDATION_ERROR", "運指が最適化する音と合いません");
  if (isDefaultFingering(theme.name, decoded)) {
    return errorResponse("VALIDATION_ERROR", "標準の運指は投稿できません");
  }

  return relay(
    await client.fingerings.$post({
      json: {
        themeId,
        userId: session.user.id,
        // **検証した運指から作り直して送る。** 同じ運指は同じ文字列になり、重複の判定
        // （一意制約）が効く。送られてきた JSON をそのまま保存すると、キーの順や余計な
        // 項目の違いで同じ運指が別物として残る
        fingering: encodeFingering(decoded),
        note: note === undefined || note === "" ? null : note,
      },
    }),
  );
}
