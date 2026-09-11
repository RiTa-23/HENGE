import { DAILY_NEURON_LIMIT } from "@henge/shared";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { LoginRequired } from "@/components/LoginRequired";
import { MyDisplayName } from "@/components/MyDisplayName";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeCard } from "@/components/ThemeCard";
import { dailyNeurons, listMyThemes } from "@/lib/api/me";
import { currentSession } from "@/lib/api/session";
import { pageTitle } from "@/lib/og";

/** 本人にしか意味のない画面。検索結果に出さない */
export const metadata: Metadata = {
  title: pageTitle("マイページ"),
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * マイページ。**自分のことだけ**を見る場所で、他人のページは無い（URLにIDを持たない）。
 *
 * - ユーザー名（表示名）の編集
 * - 本日の残りニューロン。生成の直後にしか出ない値を、いつでも確かめられるようにする
 * - 作ったお題。一覧から探し直さずに自分のものへ戻れるようにする
 *
 * SSRで Service Bindings を直接使う（`/themes` と同じ）。セッションは Route Handler と
 * 同じ `currentSession` で取る（ページ用の判定を別に書かない）。
 */
export default async function MyPage() {
  const session = await currentSession(new Request("http://me", { headers: await headers() }));

  if (session === null) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-xl px-6 py-20">
          <h1 className="font-mincho text-3xl tracking-wide text-kinari">マイページ</h1>
          <LoginRequired message="マイページを見るにはログインが必要です。" />
        </main>
        <SiteFooter />
      </>
    );
  }

  const [neurons, themes] = await Promise.all([
    dailyNeurons(session.user.id),
    listMyThemes(session.user.id),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="font-mincho text-3xl tracking-wide text-kinari">マイページ</h1>
        <p className="mt-3 text-sm tracking-widest text-kinari/50">{session.user.email}</p>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <section className="rounded-md border border-kinari/15 bg-kinari/5 px-8 py-8">
            <h2 className="font-mincho text-xl tracking-wide text-kinari">ユーザー名</h2>
            <p className="mt-2 text-sm leading-loose text-kinari/60">
              他の人に見える名前です。Googleアカウントの名前は使いません。
            </p>
            <div className="mt-6">
              <MyDisplayName initialName={session.user.displayName ?? ""} />
            </div>
          </section>

          <section className="rounded-md border border-kinari/15 bg-kinari/5 px-8 py-8">
            <h2 className="font-mincho text-xl tracking-wide text-kinari">本日のニューロン</h2>
            <p className="mt-2 text-sm leading-loose text-kinari/60">
              お題を作る・補充するときに使います。
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-xs tracking-widest text-kinari/50">残り</dt>
                <dd className="mt-1 font-mono text-3xl text-kin">
                  {/* 小数のまま出しても読めないので切り捨てる。多く見せない側に倒す */}
                  {Math.floor(neurons.remaining)}
                  <span className="ml-1 text-base text-kinari/40">/ {DAILY_NEURON_LIMIT}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-widest text-kinari/50">使った量</dt>
                <dd className="mt-1 font-mono text-3xl text-kinari/80">
                  {neurons.used.toFixed(1)}
                  <span className="ml-1 text-base text-kinari/40">（{neurons.count} 回）</span>
                </dd>
              </div>
            </dl>
            {/* リセットは 00:00 UTC。利用者への表示だけ日本時間にする（docs/03-data-model.md） */}
            <p className="mt-6 text-sm text-kinari/50">
              毎日 朝9時（日本時間）にリセットされます。
            </p>
          </section>
        </div>

        <section className="mt-16">
          <h2 className="font-mincho text-xl tracking-wide text-kinari">作ったお題</h2>
          <p className="mt-2 text-sm leading-loose text-kinari/60">
            あなたが作ったテーマと最適化する音。新しい順に並びます。
          </p>
          {themes.length === 0 ? (
            <p className="mt-8 text-kinari/50">
              まだありません。
              <a
                href="/themes/new"
                className="ml-2 text-kinari/70 underline-offset-4 hover:text-kinari hover:underline"
              >
                お題を作る →
              </a>
            </p>
          ) : (
            <div className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {themes.map((theme) => (
                <ThemeCard key={theme.id} theme={theme} />
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
