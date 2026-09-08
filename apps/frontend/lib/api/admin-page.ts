import { notFound } from "next/navigation";
import { betaLimitation } from "@/lib/beta/beta";
import { forbidNonAdmin } from "@/lib/api/admin";

/**
 * 管理画面の入口。**管理者以外には404を見せる**（403のページを出すと、
 * 「ここに管理画面がある」と教えることになる）。
 *
 * 判定そのものは公開APIと同じ forbidNonAdmin を使う。画面用に別の判定を
 * 書くと、片方だけ直したときに気付けない。
 */
export async function requireAdminPage(): Promise<void> {
  const { headers } = await import("next/headers");
  const denied = await forbidNonAdmin(new Request("http://admin", { headers: await headers() }));
  if (denied !== null) notFound();
}

/**
 * ページ（SSR）用のベータ判定。Route Handler と同じ betaLimitation を
 * リクエストヘッダー経由で呼ぶ。**ページ用の判定を別に書かない**（ずれるため）。
 */
export async function betaLimitedPage(): Promise<boolean> {
  const { headers } = await import("next/headers");
  return betaLimitation(new Request("http://page", { headers: await headers() }));
}
