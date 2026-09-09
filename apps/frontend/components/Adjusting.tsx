import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * ベータ版で「調整中」の機能を出す共通の画面。
 *
 * **機能への入口は残す**（ヘッダーやタブから辿れる）が、着地した先で調整中
 * であることを伝える。運営アカウントはこの画面を通らない（各ページが判定し、
 * 本来の画面を返す）。判定そのものは lib/beta/beta.ts。
 */
export function AdjustingView({ what }: { what: string }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-6 py-24">
        <p className="text-sm tracking-[0.25em] text-kinari/50">ベータ版</p>
        <h1 className="mt-2 font-mincho text-3xl tracking-wide text-kinari">{what}は調整中です</h1>
        <p className="mt-6 leading-loose text-kinari/70">
          公開に向けて調整しています。完成まで今しばらくお待ちください。
        </p>
        <p className="mt-10 text-sm text-kinari/50">
          <a href="/themes" className="hover:text-kinari">
            お題一覧へ戻る →
          </a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
