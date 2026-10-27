import { headers } from "next/headers";
import { backendClient } from "@/lib/api/backend";
import { currentSession } from "@/lib/api/session";
import type { ThemeSummary } from "@/lib/api/themes";

/**
 * 自分のお気に入り（登録の新しい順）。マイページ（SSR）用。
 *
 * `userId` はセッションから取った自分のIDだけを渡す（`listMyThemes` と同じ。Hono 側は
 * 渡されたIDで引くだけで「本人か」を見ない）。
 */
export async function listMyFavorites(userId: string): Promise<ThemeSummary[]> {
  const client = await backendClient();
  const response = await client.favorites.$get({ query: { userId } });
  if (!response.ok) return [];
  return ((await response.json()) as { themes: ThemeSummary[] }).themes;
}

/**
 * 詳細ページ（SSR）のお気に入りボタンの初期状態。**未ログインなら null**（ボタンを出さない）。
 * 匿名のお気に入りはサーバーに持たない（不変条件10）
 */
export async function favoriteStatus(themeId: string): Promise<{ favorited: boolean } | null> {
  const session = await currentSession(new Request("http://page", { headers: await headers() }));
  if (session === null) return null;

  const client = await backendClient();
  const response = await client.favorites.status.$get({
    query: { userId: session.user.id, themeId },
  });
  if (!response.ok) return { favorited: false };
  return (await response.json()) as { favorited: boolean };
}
