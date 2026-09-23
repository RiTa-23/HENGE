import { getCloudflareContext } from "@opennextjs/cloudflare";
import { forbidNonAdmin } from "@/lib/api/admin";
import { errorResponse } from "@/lib/api/error";

/**
 * 報告の同期用認可。**管理画面と同じ `/api/admin/reading-reports` を使うが、
 * 辞書リポジトリのワークフローからの機械アクセスも許す**ために、
 * `Authorization: Bearer <REPORTS_SYNC_TOKEN>` を管理セッションと等価に扱う。
 *
 * - トークンは `wrangler secret put REPORTS_SYNC_TOKEN`（またはローカルは
 *   `.dev.vars`）で設定する。未設定なら機械アクセスは全て弾かれる
 * - 判定はこのNext.js側で完結させる（不変条件1: Honoに認証を置かない）
 */
export async function forbidNonSyncOrAdmin(request: Request): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const token = (env as { REPORTS_SYNC_TOKEN?: string }).REPORTS_SYNC_TOKEN;
  if (token !== undefined && token !== "") {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${token}`) return null;
  }
  return forbidNonAdmin(request);
}

export { errorResponse };
