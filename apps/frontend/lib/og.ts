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
 * ビルド時だけ使う基準URL。**実行時には使われない**（下の siteUrl 参照）。
 * 共有対象のページはすべて force-dynamic なので、この値が共有カードに出ることはない。
 */
const BUILD_TIME_FALLBACK = "http://localhost:3000";

/**
 * サイトの基準URL。metadataBase（相対 og:image を絶対URLに解決するために必須）と、
 * シェアURLの絶対化に使う。
 *
 * `BETTER_AUTH_URL` を使う。これはBetter AuthのbaseURLだが、**本番ではデプロイURLに
 * なる**（Google OAuthのコールバックURIに登録する、公開されているURL）ため、
 * サイトの基準URLとして正しい。ローカルは http://localhost:3000。
 */
export async function siteUrl(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.BETTER_AUTH_URL ?? BUILD_TIME_FALLBACK;
  } catch {
    // **ビルド時はここに来る。** Next.js は `/_not-found` を静的生成するが、
    // その時点では Cloudflare のバインディングが無く getCloudflareContext が落ちる。
    // ここで握らないと `bun run build` が丸ごと失敗し、**デプロイだけが落ちる**
    // （CIは lint/tsc/テストしか回さないのでPRでは気付けない）。
    //
    // この値が実際に使われるのは静的生成される `/_not-found` だけ。共有される
    // ページ（トップ・一覧・詳細）はすべて force-dynamic で、リクエスト時に
    // バインディングのある状態で評価されるため本物のURLになる。
    return BUILD_TIME_FALLBACK;
  }
}

/** サイト名。タイトルの先頭と og:site_name の両方で使う */
const SITE_NAME = "HENGE";

/**
 * ページのタイトル。**サイト名を先頭に置く。**
 *
 * タブは幅が足りなくなると**末尾から**畳まれるため、`〜 | HENGE` の並びだと
 * タブを何枚も開いた状態で HENGE が真っ先に消える。どのタブがこのサイトかを
 * 見失わないことを、検索結果での見え方より優先する。
 *
 * **各ページで手書きしない。** 5か所に散らすと、次にページを足したときに
 * 並びが揃わない。タイトルと og:title を同じ文字列にする（docs/09-share.md）
 * ためにも、組み立てはここ1か所に閉じる。
 */
export function pageTitle(name: string): string {
  return `${SITE_NAME} | ${name}`;
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
      siteName: SITE_NAME,
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
