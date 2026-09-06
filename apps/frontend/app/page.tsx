import { SiteHeader } from "@/components/SiteHeader";
import { ThemeCard } from "@/components/ThemeCard";
import { listThemes } from "@/lib/api/themes";

export const dynamic = "force-dynamic";

/**
 * トップ。**人気テーマから直接プレイへ入れる導線を置く**（テーマ詳細を
 * 経由させない）。詳細は検索エンジンからの着地ページであって、
 * 回遊の途中に挟むものではない。
 */
export default async function HomePage() {
  const popular = await listThemes({ kind: "theme", sort: "popular", limit: 6 });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-20">
        <h1 className="font-mincho text-4xl leading-relaxed tracking-wide text-kinari">
          お題が毎回変わる、
          <br />
          日本語タイピングの修行場
        </h1>
        <p className="mt-6 max-w-xl leading-loose text-kinari/70">
          同じ文章を繰り返さないので「慣れ」が起きません。15問ひと組で打ちます。
          ログインしなくても遊べます。
        </p>

        {/* 2つのモードは排他。トップで並べて、どちらから入るかだけ選ばせる */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <a
            href="/themes"
            className="rounded-md border border-kinari/15 bg-kinari/5 px-8 py-7 transition-colors hover:border-shu/60"
          >
            <span className="font-mincho text-xl tracking-wide text-kinari">テーマで打つ</span>
            <span className="mt-3 block text-sm leading-relaxed text-kinari/60">
              好きな題材の文章で練習する。無ければその場で作れます。
            </span>
          </a>
          <a
            href="/practice"
            className="rounded-md border border-kinari/15 bg-kinari/5 px-8 py-7 transition-colors hover:border-shu/60"
          >
            <span className="font-mincho text-xl tracking-wide text-kinari">最適化練習</span>
            <span className="mt-3 block text-sm leading-relaxed text-kinari/60">
              指定した連接を必ず含む文章だけを出す。崩した運指を毎回違う文脈で固める。
            </span>
          </a>
        </div>

        <section className="mt-16">
          <h2 className="text-sm tracking-[0.25em] text-kinari/50">よく打たれているお題</h2>
          <div className="mt-6 grid gap-3">
            {popular.map((theme) => (
              <ThemeCard key={theme.id} theme={theme} />
            ))}
            {popular.length === 0 && (
              <p className="text-kinari/50">まだお題がありません。最初のお題を作ってください。</p>
            )}
          </div>
          <a
            href="/themes"
            className="mt-8 inline-block text-sm tracking-widest text-kin hover:text-kinari"
          >
            すべてのお題を見る →
          </a>
        </section>
      </main>
    </>
  );
}
