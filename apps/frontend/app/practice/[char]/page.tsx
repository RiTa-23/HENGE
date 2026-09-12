import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdjustingView } from "@/components/Adjusting";
import { DetailScroll } from "@/components/DetailScroll";
import { FormButton } from "@/components/FormButton";
import { RankingBoard } from "@/components/RankingBoard";
import { PracticeMark } from "@/components/ModeMark";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { betaLimitedPage } from "@/lib/api/admin-page";
import { ogFields, pageTitle } from "@/lib/og";
import { listRankings } from "@/lib/api/rankings";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { adjustingMetadata } from "@/lib/beta/beta";
import { playHref } from "@/lib/ui/kind";

/** 検索エンジンからの着地ページ。「ざ タイピング 練習」のような需要を拾う */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ char: string }>;
}): Promise<Metadata> {
  // **ベータ版では調整中**。着地ページの体裁を保てないため、
  // 調整中の間だけ検索エンジンに見せない
  if (await betaLimitedPage()) return adjustingMetadata();

  const char = decodePageParam((await params).char);
  if (char === null) return {};
  const title = pageTitle(`「${char}」のタイピング最適化練習`);
  const description = `読み仮名に「${char}」を含む文章だけを打つ練習。毎回違う文章が出るので、${char}の運指を文脈を変えながら詰められます。`;
  // シェアの着地ページのため、カードが確実に出るようにする（docs/09-share.md）
  return {
    title,
    description,
    ...ogFields(title, description),
  };
}

/**
 * 最適化練習の詳細ページ。テーマ詳細（/themes/[name]）と対称の構造で、
 * **行き止まりにせず「はじめる」を主役に置く**。
 */
export default async function PracticeDetailPage({
  params,
}: {
  params: Promise<{ char: string }>;
}) {
  // **ベータ版では運営アカウント以外に調整中の画面を出す**
  if (await betaLimitedPage()) return <AdjustingView what="最適化練習" />;

  // ページのルートパラメータはエンコードされたまま渡ってくる（Route Handler とは違う）
  const char = decodePageParam((await params).char);
  if (char === null) notFound();

  // **kind は "constraint"。** 同じ名前のテーマが別に存在しうるため、
  // ここで kind を間違えるとテーマ側のプールを開いてしまう
  const theme = await findTheme("constraint", char);
  if (theme === null) notFound();

  // 最適化する音は短文だけなので、ランキングも1つ
  const entries = await listRankings(theme.id, "sentence");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <DetailScroll
          mark={<PracticeMark className="h-5 w-5" />}
          eyebrow="最適化する音"
          title={theme.name}
          description={
            <>
              読み仮名に「{theme.name}」を含む文章だけが出ます。表記に現れていなくても構いません。
              15問ひと組で、同じ文章は繰り返し出ません。
            </>
          }
          stats={[
            {
              label: "お題",
              value: theme.promptCounts.sentence,
            },
            { label: "プレイ", value: theme.totalPlayCount, unit: "回" },
          ]}
          actions={
            <FormButton
              form="sentence"
              size="lg"
              label="打つ"
              href={playHref("constraint", theme.name)}
              // 「生成困難」は札を暗くして示す
              difficult={theme.generationStatus === "difficult"}
            />
          }
        />

        <RankingBoard boards={[{ form: "sentence", entries }]} />

        <p className="mt-10 text-sm text-kinari/50">
          <a href="/practice" className="hover:text-kinari">
            ほかの音を見る →
          </a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
