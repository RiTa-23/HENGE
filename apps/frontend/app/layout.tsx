import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
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
      <body>{children}</body>
    </html>
  );
}
