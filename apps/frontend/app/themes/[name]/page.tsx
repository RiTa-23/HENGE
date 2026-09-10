import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ogFields, pageTitle } from "@/lib/og";
import { playSize } from "@henge/shared";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { playHref } from "@/lib/ui/kind";

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
export default async function ThemeDetailPage({ params }: { params: Promise<{ name: string }> }) {
  // ページのルートパラメータはエンコードされたまま渡ってくる
  const name = decodePageParam((await params).name);
  if (name === null) notFound();

  const theme = await findTheme("theme", name);
  if (theme === null) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-20">
        <h1 className="font-mincho text-4xl tracking-wide text-kinari">{theme.name}</h1>
        <p className="mt-6 leading-loose text-kinari/70">
          「{theme.name}」をテーマにしたお題です。短文と単語の2つの打ち方があり、どちらも同じ文章・
          同じ語は繰り返し出ません。
        </p>

        <dl className="mt-10 flex gap-10 text-sm">
          <div>
            <dt className="tracking-widest text-kinari/50">プレイ回数</dt>
            <dd className="mt-1 font-mono text-2xl text-kin">{theme.totalPlayCount}</dd>
          </div>
        </dl>

        {/*
          **形式の選択は行き止まりにしない。** 単語のお題がまだ無いテーマでも
          ボタンは出す。押すとプレイ画面の枯渇と同じ導線（ログイン → 作る）に入る。
          ここでボタンごと隠すと、「このテーマには単語が無い」ことすら伝わらない。
        */}
        <div className="mt-14 flex flex-wrap gap-4">
          {(["sentence", "word"] as const).map((form) => (
            <a
              key={form}
              href={playHref("theme", theme.name, form)}
              className="min-w-56 rounded-md border border-shu bg-shu/15 px-8 py-4 font-gothic tracking-[0.2em] text-kinari transition-colors hover:bg-shu/25"
            >
              <span className="block text-lg">{form === "word" ? "単語" : "短文"}で打つ</span>
              <span className="mt-1 block font-mono text-xs tracking-normal text-kinari/60">
                {playSize(form)}問ひと組 ／ お題 {theme.promptCounts[form]}
              </span>
            </a>
          ))}
        </div>

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
