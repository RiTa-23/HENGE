import { getCloudflareContext } from "@opennextjs/cloudflare";
import { backendClient } from "@/lib/api/backend";
import { canEditDefaultFingering } from "@/lib/api/fingering-guard";
import { currentSession } from "@/lib/api/session";

/**
 * いまのセッションが、この最適化の既定の運指を変えられるか。詳細ページ（SSR）用。
 *
 * **判定は公開API（`PUT /api/themes/fingering`）と同じ関数を使う。** 画面用に別の判定を
 * 書くと、欄は出るのに保存で弾かれる（またはその逆）ずれ方をする。欄を出すかどうかは
 * 見た目の話で、守っているのは公開APIの側。
 */
export async function defaultFingeringEditable(themeId: string): Promise<boolean> {
  const { headers } = await import("next/headers");
  const session = await currentSession(new Request("http://page", { headers: await headers() }));
  if (session === null) return false;

  const client = await backendClient();
  const creator = await client.themes[":id"].creator.$get({ param: { id: themeId } });
  if (!creator.ok) return false;
  const { createdBy } = (await creator.json()) as { createdBy: string | null };
  const { env } = await getCloudflareContext({ async: true });
  return canEditDefaultFingering(session, createdBy, env.ADMIN_EMAILS);
}
