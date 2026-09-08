import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";

/**
 * OGPの共通部分（docs/09-share.md）。
 *
 * **OG画像の動的生成はMVPのスコープ外。** 全ページ共通の静的アセット1枚を使う。
 * ページごとに変わるのは og:title / og:description だけで、それらは既存の
 * metadata の title / description を流す。
 */

const OG_IMAGE_PATH = "/og.png";

/**
 * サイトの基準URL。metadataBase（相対 og:image を絶対URLに解決するために必須）と、
 * シェアURLの絶対化に使う。
 *
 * `BETTER_AUTH_URL` を使う。これはBetter AuthのbaseURLだが、**本番ではデプロイURLに
 * なる**（Google OAuthのコールバックURIに登録する、公開されているURL）ため、
 * サイトの基準URLとして正しい。ローカルは http://localhost:3000。
 */
export async function siteUrl(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  return env.BETTER_AUTH_URL;
}

/**
 * OGPフィールド。各ページの metadata に広げて使う。
 *
 * **openGraph / twitter はページごとにそろえて書く。** Next.jsのmetadataは
 * 浅くマージされるため、ページで openGraph を定義するとレイアウトの分が
 * 上書きされる（足し算にならない）。
 */
export function ogFields(
  title: string,
  description: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      siteName: "HENGE",
      type: "website",
      images: [OG_IMAGE_PATH],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE_PATH],
    },
  };
}
