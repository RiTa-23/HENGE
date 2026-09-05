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
          同じ文章を繰り返さないので「慣れ」が起きません。テーマを選んで、
          15問ひと組で打ちます。ログインしなくても遊べます。
        </p>

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
