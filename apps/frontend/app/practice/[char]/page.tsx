import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdjustingView } from "@/components/Adjusting";
import { DetailMato } from "@/components/DetailScroll";
import { FingeringEditor } from "@/components/FingeringEditor";
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
        <DetailMato
          mark={<PracticeMark className="h-5 w-5" />}
          eyebrow="最適化する音"
          title={theme.name}
          description={
            <>
              読み仮名に「{theme.name}」を含む文章だけが出ます。表記に現れていなくても構いません。
              10問ひと組で、同じ文章は繰り返し出ません。
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

        {/*
          最適化の運指。打つ前にここで決めておける（開始前の画面と同じ設定）。
          標準運指を崩す練習なので、どう崩すかを決める場所を練習の入口に置く
        */}
        <section aria-labelledby="fingering-heading" className="mt-12">
          <h2 id="fingering-heading" className="font-mincho text-xl tracking-wide text-kinari">
            運指
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-kinari/60">
            「{theme.name}」を打つ打ち方と指を決めると、プレイ中の的の箇所でその打ち方と指が出ます。
            決めなければ標準の運指です。設定はこの端末に保存されます。
          </p>
          <div className="mt-6 rounded-lg border border-kinari/15 bg-kinari/5 p-6">
            <FingeringEditor sound={theme.name} />
          </div>
        </section>

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
