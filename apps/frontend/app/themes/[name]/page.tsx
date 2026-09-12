import { PROMPT_FORMS } from "@henge/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailScroll } from "@/components/DetailScroll";
import { difficultForms } from "@/components/DifficultBadge";
import { FormButton } from "@/components/FormButton";
import { RankingBoard } from "@/components/RankingBoard";
import { ThemeMark } from "@/components/ModeMark";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ogFields, pageTitle } from "@/lib/og";
import { listRankings } from "@/lib/api/rankings";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { detailHref, parsePlayForm, playHref } from "@/lib/ui/kind";

export const dynamic = "force-dynamic";

/** 検索エンジンからの着地ページ。テーマ名を主語にした説明を出す */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const name = decodePageParam((await params).name);
  if (name === null) return {};
  const title = pageTitle(`「${name}」のタイピング練習`);
  const description = `「${name}」をテーマにした日本語タイピングのお題。毎回違う文章が出るので、慣れが起きません。`;
  return {
    title,
    description,
    // **ランキングのタブ指定（`?ranking=word`）でURLが2つに割れる。** 着地ページの
    // 評価を1つに寄せるため、クエリ無しの詳細を正規URLとして明示する
    alternates: { canonical: detailHref("theme", name) },
    // **シェアの着地ページ。** 結果のX投稿からここに来るため、カードが確実に
    // 出るようにする（docs/09-share.md）
    ...ogFields(title, description),
  };
}

/**
 * テーマ詳細。**SEOの主戦場**なので行き止まりにせず、「はじめる」を主役に置く。
 */
export default async function ThemeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ ranking?: string }>;
}) {
  // ページのルートパラメータはエンコードされたまま渡ってくる
  const [{ name: raw }, { ranking }] = await Promise.all([params, searchParams]);
  const name = decodePageParam(raw);
  if (name === null) notFound();

  const theme = await findTheme("theme", name);
  if (theme === null) notFound();

  const difficult = difficultForms(theme);
  // ランキングは形式ごとに別。全部引いてタブで切り替える（`RankingBoard`）
  const boards = await Promise.all(
    PROMPT_FORMS.map(async (form) => ({ form, entries: await listRankings(theme.id, form) })),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <DetailScroll
          mark={<ThemeMark className="h-5 w-5" />}
          eyebrow="テーマ"
          title={theme.name}
          description={
            <>
              「{theme.name}」をテーマにしたお題です。単語・短文・長文の3つの打ち方があり、
              どれも同じ文章・同じ語は繰り返し出ません。
            </>
          }
          // 「生成困難」は在庫の数字ではなく、その形式の札を暗くして示す
          stats={[
            {
              label: "単語のお題",
              value: theme.promptCounts.word,
            },
            {
              label: "短文のお題",
              value: theme.promptCounts.sentence,
            },
            {
              label: "長文のお題",
              value: theme.promptCounts.long,
            },
            { label: "プレイ", value: theme.totalPlayCount, unit: "回" },
          ]}
          actions={
            /*
              **形式の選択は行き止まりにしない。** 単語のお題がまだ無いテーマでも
              ボタンは出す。押すとプレイ画面の枯渇と同じ導線（ログイン → 作る）に入る。
              ここでボタンごと隠すと、「このテーマには単語が無い」ことすら伝わらない。
            */
            PROMPT_FORMS.map((form) => (
              <FormButton
                key={form}
                form={form}
                size="lg"
                href={playHref("theme", theme.name, form)}
                difficult={difficult.includes(form)}
              />
            ))
          }
        />

        <RankingBoard
          boards={boards}
          // クエリが無ければ先頭のタブ（単語）。既定の形式（短文）とは別の話で、
          // 並びの先頭が選ばれていないと変に見える
          initialForm={ranking === undefined ? undefined : parsePlayForm(ranking)}
        />

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
