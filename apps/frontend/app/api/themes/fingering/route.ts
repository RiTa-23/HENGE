import { getCloudflareContext } from "@opennextjs/cloudflare";
import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";
import { denyIfCannotEditFingering } from "@/lib/api/fingering-guard";
import { defaultFingeringSchema } from "@/lib/api/schema";
import { currentSession } from "@/lib/api/session";
import { betaLimitation } from "@/lib/beta/beta";
import { canonicalFingering, decodeFingering, isDefaultFingering } from "@/lib/practice/fingering";

export const dynamic = "force-dynamic";

/**
 * 最適化の既定の運指を後から変える。**変えられるのはその最適化の作成者と運営だけ**
 * （`lib/api/fingering-guard.ts`）。`fingering: null` で既定を外す（標準運指に戻す）。
 *
 * 作成者のユーザーIDは公開の詳細に載せていないので、判定のためにここで Hono から引く。
 */
export async function PUT(request: Request) {
  const session = await currentSession(request);
  if (session === null) return errorResponse("UNAUTHORIZED");

  // **ベータ版では最適化練習ごと閉じている**ので、非運営は変えられない（作成と同じ扱い）
  if (await betaLimitation(request)) {
    return errorResponse("FORBIDDEN", "最適化練習は調整中です");
  }

  const parsed = defaultFingeringSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("VALIDATION_ERROR");
  const { themeId, fingering } = parsed.data;

  const client = await backendClient();
  const detail = await client.themes[":id"].$get({ param: { id: themeId } });
  if (!detail.ok) return errorResponse("NOT_FOUND", "最適化が見つかりません");
  const { theme } = (await detail.json()) as { theme: { kind: string; name: string } };
  if (theme.kind !== "constraint") {
    return errorResponse("VALIDATION_ERROR", "運指を決められるのは最適化練習だけです");
  }

  const creator = await client.themes[":id"].creator.$get({ param: { id: themeId } });
  if (!creator.ok) return errorResponse("NOT_FOUND", "最適化が見つかりません");
  const { createdBy } = (await creator.json()) as { createdBy: string | null };
  const { env } = await getCloudflareContext({ async: true });
  const denied = denyIfCannotEditFingering(session, createdBy, env.ADMIN_EMAILS);
  if (denied !== null) return denied;

  // 音と照らす。合わなければ弾く（作成時と同じ）。標準運指と同じなら外す（保存しない）
  const decoded = fingering === null ? null : decodeFingering(fingering, theme.name);
  if (fingering !== null && decoded === null) {
    return errorResponse("VALIDATION_ERROR", "運指が最適化する音と合いません");
  }
  const defaultFingering =
    decoded === null || isDefaultFingering(theme.name, decoded)
      ? null
      : canonicalFingering(theme.name, decoded);

  return relay(
    await client.themes["default-fingering"].$put({ json: { themeId, defaultFingering } }),
  );
}
