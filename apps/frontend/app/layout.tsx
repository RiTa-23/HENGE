import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { ogFields, siteUrl } from "@/lib/og";
import "./globals.css";

/**
 * ローマ字列とキーボードの書体。**next/font で自己ホストする**（等幅は
 * 使用文字が英数字に限られるので、ビルド時にサブセットを固定できる）。
 */
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * metadataBase は相対 og:image を絶対URLに解決するために必須（docs/09-share.md）。
 * レイアウトで1回定義すれば全ページに継承される。
 * openGraph / twitter は浅くマージされるため、独自に定義するページは lib/og.ts の
 * ogFields でそろえて書く。
 */
export async function generateMetadata(): Promise<Metadata> {
  const description = "お題が毎回生まれる日本語タイピング練習ツール";
  return {
    title: "HENGE",
    description,
    metadataBase: new URL(await siteUrl()),
    ...ogFields("HENGE", description),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Cloudflare Web Analytics のビーコン。
 *
 * **トークンは秘密ではない。** 公開HTMLに載る前提の値で、Cloudflare側は
 * 登録したホスト名（henge.ritane.co）以外からの計測を受け付けない。
 *
 * `henge.ritane.co` は Worker が直接返しているため、**ゾーン側の自動挿入は効かない。**
 * ここで自分で埋め込む必要がある。
 */
const WEB_ANALYTICS_TOKEN = "43af9fa87b064462a11a85b7761291a5";

/**
 * 出し分けを `siteUrl()`（＝リクエスト時の値）で判定しない。
 *
 * **`/privacy` のような静的ページはビルド時にHTMLが焼かれる。** その時点では
 * Cloudflare のバインディングが無く `siteUrl()` は localhost に落ちるので、
 * 「本番かどうか」の判定が必ず外れ、そのページにだけビーコンが入らなくなる。
 *
 * `NODE_ENV` はバンドル時に定数へ畳まれるため、静的ページでも動的ページでも
 * 同じ結果になる。`bun run preview` ではローカルでもビーコンが出るが、
 * Cloudflare は登録したホスト名以外からの計測を受け付けないので実害はない。
 */

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={jetBrainsMono.variable}>
      <head>
        {/*
          日本語2書体は Google Fonts CDN から読む。**自己ホストにしない。**
          お題が動的生成でビルド時に使用漢字を確定できず、サブセットを固定する
          自己ホストでは対応できない。CDN は unicode-range で分割配信するため、
          ページごとに実際に使う文字だけが落ちてくる。
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        />
      </head>
      {/* **縦のフレックスにする。** SiteFooter の `mt-auto` を効かせて、
          内容の短いページでもフッターが画面の下に着く */}
      <body className="flex min-h-dvh flex-col">
        {children}
        {/*
          **素の `<script>` で書かない。** Reactは描画中に見つけたscriptを実行せず、
          開発中は毎回コンソールに警告が出る。next/script なら注入まで面倒を見る。
          `afterInteractive` は表示を妨げない位置（Cloudflareの案内どおり本文のあと）。
        */}
        {process.env.NODE_ENV === "production" && (
          <Script
            type="module"
            src="https://static.cloudflareinsights.com/beacon.min.js"
            strategy="afterInteractive"
            data-cf-beacon={`{"token": "${WEB_ANALYTICS_TOKEN}"}`}
          />
        )}
      </body>
    </html>
  );
}
