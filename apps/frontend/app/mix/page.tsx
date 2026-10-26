import { MIX_NAME } from "@henge/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailScroll } from "@/components/DetailScroll";
import { MixMark } from "@/components/ModeMark";
import { RankingBoard } from "@/components/RankingBoard";
import { SealButton } from "@/components/SealButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listRankings } from "@/lib/api/rankings";
import { findTheme } from "@/lib/api/themes";
import { ogFields, pageTitle } from "@/lib/og";
import { playHref } from "@/lib/ui/kind";

const TITLE = pageTitle("ごちゃまぜタイピング");
const DESCRIPTION =
  "テーマを選ばずにすぐ始められる日本語タイピング。ランダムな言葉の組から毎回違う文章が出ます。";

/** シェアの着地ページ（結果のX投稿からここへ来る。docs/09-share.md） */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...ogFields(TITLE, DESCRIPTION),
};

export const dynamic = "force-dynamic";

/**
 * ごちゃまぜの詳細。テーマ詳細（/themes/[name]）と同じ構えで、**「打つ」を主役に置く**。
 * プレイ画面の「戻る」とランキング・シェアの着地先になる（`detailHref("mix")`）。
 */
export default async function MixDetailPage() {
  // 行が無ければ Hono 側で作られる（findOrCreateMixTheme）。ここで null になるのは障害のときだけ
  const theme = await findTheme("mix", MIX_NAME);
  if (theme === null) notFound();

  // ごちゃまぜは短文だけなので、ランキングも1つ
  const entries = await listRankings(theme.id, "sentence");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <DetailScroll
          mark={<MixMark className="h-5 w-5" />}
          eyebrow="ごちゃまぜ"
          title={theme.name}
          description={
            <>
              テーマを選ばずに打てるお題です。よく使われる言葉からランダムに2語ずつ選び、
              それを使った文章を作ります。10問ひと組で、同じ文章は繰り返し出ません。
            </>
          }
          stats={[
            { label: "お題", value: theme.promptCounts.sentence },
            { label: "プレイ", value: theme.totalPlayCount, unit: "回" },
          ]}
          actions={
            // 形式が1つなので木札ではなく朱印（`SealButton`）
            <SealButton
              href={playHref("mix", theme.name)}
              difficult={theme.generationStatus === "difficult"}
            />
          }
        />

        <RankingBoard boards={[{ form: "sentence", entries }]} />

        <p className="mt-10 text-sm text-kinari/50">
          <a href="/themes" className="hover:text-kinari">
            ほかのお題を見る →
          </a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
