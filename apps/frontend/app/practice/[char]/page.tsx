import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { playHref } from "@/lib/ui/kind";

/** 検索エンジンからの着地ページ。「ざ タイピング 練習」のような需要を拾う */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ char: string }>;
}): Promise<Metadata> {
  const char = decodePageParam((await params).char);
  if (char === null) return {};
  return {
    title: `「${char}」を含むタイピング練習 | HENGE`,
    description: `読み仮名に「${char}」を含む文章だけを打つ練習。毎回違う文章が出るので、${char}の運指を文脈を変えながら詰められます。`,
  };
}

/**
 * 含む文字の練習ページ。テーマ詳細（/themes/[name]）と対称の構造で、
 * **行き止まりにせず「はじめる」を主役に置く**。
 */
export default async function PracticeDetailPage({
  params,
}: {
  params: Promise<{ char: string }>;
}) {
  // ページのルートパラメータはエンコードされたまま渡ってくる（Route Handler とは違う）
  const char = decodePageParam((await params).char);
  if (char === null) notFound();

  // **kind は "constraint"。** 同じ名前のテーマが別に存在しうるため、
  // ここで kind を間違えるとテーマ側のプールを開いてしまう
  const theme = await findTheme("constraint", char);
  if (theme === null) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-20">
        <p className="text-sm tracking-[0.25em] text-kinari/50">含む文字</p>
        <h1 className="mt-2 font-mincho text-4xl tracking-wide text-kinari">{theme.name}</h1>
        <p className="mt-6 leading-loose text-kinari/70">
          読み仮名に「{theme.name}」を含む文章だけが出ます。表記に現れていなくても構いません。
          15問ひと組で、同じ文章は繰り返し出ません。
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
          href={playHref("constraint", theme.name)}
          className="mt-14 inline-block rounded-md border border-shu bg-shu/15 px-10 py-4 font-gothic tracking-[0.2em] text-kinari transition-colors hover:bg-shu/25"
        >
          はじめる
        </a>

        <p className="mt-10 text-sm text-kinari/50">
          <a href="/practice" className="hover:text-kinari">
            ほかの文字を見る →
          </a>
        </p>
      </main>
    </>
  );
}
