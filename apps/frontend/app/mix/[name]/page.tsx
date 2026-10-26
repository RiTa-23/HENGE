import { mixWordsPerSentence, type MixName } from "@henge/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailScroll } from "@/components/DetailScroll";
import { MixMark } from "@/components/ModeMark";
import { RankingBoard } from "@/components/RankingBoard";
import { SealButton } from "@/components/SealButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listRankings } from "@/lib/api/rankings";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { ogFields, pageTitle } from "@/lib/og";
import { playHref } from "@/lib/ui/kind";
import { MIX_COPY } from "@/lib/ui/mix";

/** おまかせ・ごちゃまぜの名前。`MIX_MODES` に無い名前なら null */
function mixNameOf(raw: string): MixName | null {
  const name = decodePageParam(raw);
  if (name === null) return null;
  const normalized = name.normalize("NFC");
  return mixWordsPerSentence(normalized) === null ? null : (normalized as MixName);
}

/** シェアの着地ページ（結果のX投稿からここへ来る。docs/09-share.md） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const name = mixNameOf((await params).name);
  if (name === null) return {};
  const title = pageTitle(`${name}タイピング`);
  const description = MIX_COPY[name].description;
  return { title, description, ...ogFields(title, description) };
}

export const dynamic = "force-dynamic";

/**
 * おまかせ・ごちゃまぜの詳細。テーマ詳細（/themes/[name]）と同じ構えで、**「打つ」を主役に置く**。
 * プレイ画面の「戻る」とランキング・シェアの着地先になる（`detailHref("mix", name)`）。
 */
export default async function MixDetailPage({ params }: { params: Promise<{ name: string }> }) {
  // ページのルートパラメータはエンコードされたまま渡ってくる
  const name = mixNameOf((await params).name);
  if (name === null) notFound();

  // 行が無ければ Hono 側で作られる（findOrCreateMixTheme）。ここで null になるのは障害のときだけ
  const theme = await findTheme("mix", name);
  if (theme === null) notFound();

  // 短文だけなので、ランキングも1つ
  const entries = await listRankings(theme.id, "sentence");
  const chaos = mixWordsPerSentence(name) !== 1;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <DetailScroll
          mark={<MixMark pips={chaos ? 5 : 1} className="h-5 w-5" />}
          eyebrow={chaos ? "カオスモード" : "おまかせ"}
          title={theme.name}
          description={<>{MIX_COPY[name].description}10問ひと組で、同じ文章は繰り返し出ません。</>}
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
