import type { Metadata } from "next";
import { AdjustingView } from "@/components/Adjusting";
import { SiteHeader } from "@/components/SiteHeader";
import { CreateThemeForm } from "@/components/CreateThemeForm";
import { betaLimitedPage } from "@/lib/api/admin-page";

/** 作成画面は検索結果に出さない */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewThemePage() {
  // **ベータ版ではお題の生成を調整中にする。** 既にあるお題は引き続き遊べる
  if (await betaLimitedPage()) return <AdjustingView what="お題の生成" />;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-6 py-20">
        <h1 className="font-mincho text-3xl tracking-wide text-kinari">お題を作る</h1>
        <p className="mt-5 leading-loose text-kinari/70">
          テーマを決めると、そのテーマに沿った15問をその場で作ります。
          同じ名前のお題が既にあれば、それをそのまま使います（作り直しません）。
        </p>
        <CreateThemeForm kind="theme" />
      </main>
    </>
  );
}
