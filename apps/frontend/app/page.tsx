import type { Metadata } from "next";
import { HeroLogo } from "@/components/HeroLogo";
import { PracticeMark, ThemeMark } from "@/components/ModeMark";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeCard } from "@/components/ThemeCard";
import { ogFields } from "@/lib/og";
import { listThemes } from "@/lib/api/themes";

const TOP_TITLE = "お題が毎回変わる、日本語タイピングの修行場 | HENGE";
const TOP_DESCRIPTION = "お題が毎回変わる日本語タイピング練習ツール";

/** インデックス対象。シェアされたときのカードにもこのタイトルを使う */
export const metadata: Metadata = {
  title: TOP_TITLE,
  description: TOP_DESCRIPTION,
  ...ogFields(TOP_TITLE, TOP_DESCRIPTION),
};

export const dynamic = "force-dynamic";

/**
 * トップ。**人気テーマから直接プレイへ入れる導線を置く**（テーマ詳細を
 * 経由させない）。詳細は検索エンジンからの着地ページであって、
 * 回遊の途中に挟むものではない。
 *
 * 第一画面は**ロゴ → キャッチコピー → 2つのモードの選択**の順。何のサイトかを
 * 1画面で伝え、次に「どちらから入るか」だけを選ばせる。タイトル（HENGE）は
 * 見出しではなくブランドの表明なので `h1` はキャッチコピー側に置く。
 */
export default async function HomePage() {
  const popular = await listThemes({ kind: "theme", sort: "popular", limit: 6 });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 pb-20 pt-16">
        <section className="text-center">
          <HeroLogo />
          <h1 className="mx-auto mt-10 max-w-2xl font-mincho text-4xl leading-relaxed tracking-wide text-kinari">
            お題が毎回生まれる、
            <br />
            日本語タイピングの修行場
          </h1>
          {/* リード文は説明より一撃で伝えたいので、本文より大きい明朝で独立させる。
              h1 に何のサイトか（インデックス対象のため）を任せ、ここに差分の芯を置く */}
          <p className="mx-auto mt-8 font-mincho text-xl tracking-wide text-kinari">
            まだ存在しない文章を、打つ。
          </p>
          <p className="mx-auto mt-4 max-w-xl leading-loose text-kinari/70">
            {/* 文の区切りで改行する。自動折返しに任せると「回っ／てこない」のように
                句の途中で切れる。br はデスクトップだけ効かせ、モバイルは自然な流れに戻す */}
            テーマから、AIがお題をその場でつくります。
            <br className="hidden sm:inline" />
            打ったお題は二度と回ってこないので、
            <br className="hidden sm:inline" />
            暗記ではなくその場で打つ力が鍛えられます。
            <br className="hidden sm:inline" />
            ログインしなくても遊べます。
          </p>
        </section>

        {/* 2つのモードは排他。トップで並べて、どちらから入るかだけ選ばせる。
            紋（ModeMark）はモチーフの流用ではなく新しい線画（docs/07-ui.md） */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          <a
            href="/themes"
            className="group rounded-md border border-kinari/15 bg-kinari/5 px-8 py-7 transition-colors hover:border-shu/60"
          >
            <ThemeMark className="h-12 w-12 text-kinari/40 transition-colors group-hover:text-kinari" />
            <span className="mt-4 block font-mincho text-xl tracking-wide text-kinari">
              テーマで打つ
            </span>
            <span className="mt-3 block text-sm leading-relaxed text-kinari/60">
              好きな題材の文章で練習する。無ければその場で作れます。
            </span>
          </a>
          <a
            href="/practice"
            className="group rounded-md border border-kinari/15 bg-kinari/5 px-8 py-7 transition-colors hover:border-shu/60"
          >
            <PracticeMark className="h-12 w-12 text-kinari/40 transition-colors group-hover:text-kinari" />
            <span className="mt-4 block font-mincho text-xl tracking-wide text-kinari">
              最適化練習
            </span>
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
