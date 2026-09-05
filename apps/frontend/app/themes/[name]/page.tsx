import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { decodePageParam, findTheme } from "@/lib/api/themes";

export const dynamic = "force-dynamic";

/** 検索エンジンからの着地ページ。テーマ名を主語にした説明を出す */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const name = decodePageParam((await params).name);
  if (name === null) return {};
  return {
    title: `「${name}」のタイピング練習 | HENGE`,
    description: `「${name}」をテーマにした日本語タイピングのお題。毎回違う文章が出るので、慣れが起きません。`,
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
          「{theme.name}」をテーマにしたお題です。15問ひと組で、同じ文章は繰り返し出ません。
        </p>

        <dl className="mt-10 flex gap-10 text-sm">
          <div>
            <dt className="tracking-widest text-kinari/50">お題数</dt>
            <dd className="mt-1 font-mono text-2xl text-kin">{theme.promptCount}</dd>
          </div>
          <div>
            <dt className="tracking-widest text-kinari/50">プレイ回数</dt>
            <dd className="mt-1 font-mono text-2xl text-kin">{theme.totalPlayCount}</dd>
          </div>
        </dl>

        <a
          href={`/play/${encodeURIComponent(theme.name)}`}
          className="mt-14 inline-block rounded-md border border-shu bg-shu/15 px-10 py-4 font-gothic tracking-[0.2em] text-kinari transition-colors hover:bg-shu/25"
        >
          はじめる
        </a>

        <p className="mt-10 text-sm text-kinari/50">
          <a href="/themes" className="hover:text-kinari">
            ほかのお題を見る →
          </a>
        </p>
      </main>
    </>
  );
}
