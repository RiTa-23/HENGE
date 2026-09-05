import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { sessionStartSchema } from "@/lib/api/schema";
import { currentUserId } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** プレイ開始。匿名でも遊べる */
export async function POST(request: Request) {
  const parsed = sessionStartSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");

  const userId = await currentUserId();
  const client = await backendClient();

  // ログイン時はサーバー側の進捗を使うので、クライアントの offset は渡さない
  return relay(
    await client.sessions.start.$post({
      json:
        userId === null
          ? { themeId: parsed.data.themeId, offset: parsed.data.offset ?? 0 }
          : { themeId: parsed.data.themeId, userId },
    }),
  );
}
