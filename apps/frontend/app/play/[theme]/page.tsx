import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayScreen } from "@/components/play/PlayScreen";
import { decodePageParam, findTheme } from "@/lib/api/themes";

/** プレイ画面は検索結果に出さない（着地ページはテーマ詳細） */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

/**
 * プレイ画面。**中身はCSR**（打鍵の状態がすべてクライアントにあるため）。
 * ここでテーマ名からIDを解決するのは、クライアントに1往復増やさないため。
 */
export default async function PlayPage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  // **ページのパラメータはエンコードされたまま渡ってくる**（Route Handler とは違う）。
  // デコードしないと日本語のテーマ名が1件も引けない
  const name = decodePageParam(theme);
  if (name === null) notFound();

  const found = await findTheme("theme", name);
  if (found === null) notFound();

  return <PlayScreen themeId={found.id} themeName={found.name} promptCount={found.promptCount} />;
}
