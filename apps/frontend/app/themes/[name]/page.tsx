import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailScroll } from "@/components/DetailScroll";
import { DifficultBadge } from "@/components/DifficultBadge";
import { FormButton } from "@/components/FormButton";
import { RankingBoard } from "@/components/RankingBoard";
import { ThemeMark } from "@/components/ModeMark";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ogFields, pageTitle } from "@/lib/og";
import { listRankings } from "@/lib/api/rankings";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { parsePlayForm, playHref } from "@/lib/ui/kind";

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

  // ランキングは短文と単語で別。両方引いてタブで切り替える（`RankingBoard`）
  const [sentence, word] = await Promise.all([
    listRankings(theme.id, "sentence"),
    listRankings(theme.id, "word"),
  ]);

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
              「{theme.name}」をテーマにしたお題です。短文と単語の2つの打ち方があり、
              どちらも同じ文章・同じ語は繰り返し出ません。
            </>
          }
          stats={[
            {
              label: "短文のお題",
              value: theme.promptCounts.sentence,
              badge:
                theme.generationStatus === "difficult" ? (
                  <DifficultBadge forms={["sentence"]} />
                ) : undefined,
            },
            {
              label: "単語のお題",
              value: theme.promptCounts.word,
              badge:
                theme.wordGenerationStatus === "difficult" ? (
                  <DifficultBadge forms={["word"]} />
                ) : undefined,
            },
            { label: "プレイ", value: theme.totalPlayCount, unit: "回" },
          ]}
          actions={
            /*
              **形式の選択は行き止まりにしない。** 単語のお題がまだ無いテーマでも
              ボタンは出す。押すとプレイ画面の枯渇と同じ導線（ログイン → 作る）に入る。
              ここでボタンごと隠すと、「このテーマには単語が無い」ことすら伝わらない。
            */
            (["sentence", "word"] as const).map((form) => (
              <FormButton
                key={form}
                form={form}
                size="lg"
                href={playHref("theme", theme.name, form)}
              />
            ))
          }
        />

        <RankingBoard
          boards={[
            { form: "sentence", entries: sentence },
            { form: "word", entries: word },
          ]}
          initialForm={parsePlayForm(ranking)}
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
