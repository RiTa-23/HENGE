import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayScreen } from "@/components/play/PlayScreen";
import { siteUrl } from "@/lib/og";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { detailHref, parseThemeKind } from "@/lib/ui/kind";

/** プレイ画面は検索結果に出さない（着地ページはテーマ詳細） */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

/**
 * プレイ画面。**中身はCSR**（打鍵の状態がすべてクライアントにあるため）。
 * ここでテーマ名からIDを解決するのは、クライアントに1往復増やさないため。
 *
 * **テーマモードと最適化モードで画面を分けない。** 打鍵の体験も、叩くAPIも、
 * オフセットの扱いも同一で、違うのは「どのプールを開くか」だけ。ただし一意制約が
 * `(kind, normalized_name)` なので**名前だけではプールが決まらず**、`?kind=` が要る。
 */
export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ theme: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const [{ theme }, { kind }] = await Promise.all([params, searchParams]);
  // **ページのパラメータはエンコードされたまま渡ってくる**（Route Handler とは違う）。
  // デコードしないと日本語のテーマ名が1件も引けない
  const name = decodePageParam(theme);
  if (name === null) notFound();

  const themeKind = parseThemeKind(kind);
  const found = await findTheme(themeKind, name);
  if (found === null) notFound();

  // 結果のX投稿の共有先。**プレイ画面ではなく着地ページ（詳細）**に誘導する
  // （docs/09-share.md）。絶対URLが必要なので、ここ（サーバー側）で組み立てる。
  // 組み立ては detailHref に集約。手で /play や /themes を書かない
  const shareUrl = new URL(detailHref(themeKind, found.name), await siteUrl()).toString();

  return (
    <PlayScreen themeId={found.id} themeName={found.name} kind={themeKind} shareUrl={shareUrl} />
  );
}
