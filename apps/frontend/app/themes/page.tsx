import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeCard } from "@/components/ThemeCard";
import { listThemes } from "@/lib/api/themes";

export const metadata: Metadata = {
  title: "お題一覧 | HENGE",
  description: "日本語タイピング練習のお題テーマ一覧。人気順・新着順で選べます。",
};

export const dynamic = "force-dynamic";

/** テーマ一覧。SSRでインデックス対象 */
export default async function ThemesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const current = sort === "recent" ? "recent" : "popular";
  const themes = await listThemes({ kind: "theme", sort: current, limit: 50 });

  const tabs = [
    { key: "popular", label: "人気順" },
    { key: "recent", label: "新着順" },
  ] as const;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="font-mincho text-3xl tracking-wide text-kinari">お題一覧</h1>

        <div className="mt-8 flex gap-2">
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={`/themes?sort=${tab.key}`}
              className={
                tab.key === current
                  ? "rounded-full border border-kin px-5 py-1.5 text-sm tracking-widest text-kinari"
                  : "rounded-full border border-kinari/15 px-5 py-1.5 text-sm tracking-widest text-kinari/60 hover:text-kinari"
              }
            >
              {tab.label}
            </a>
          ))}
        </div>

        <div className="mt-8 grid gap-3">
          {themes.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} />
          ))}
          {themes.length === 0 && <p className="text-kinari/50">まだお題がありません。</p>}
        </div>
      </main>
    </>
  );
}
