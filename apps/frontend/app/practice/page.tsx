import type { Metadata } from "next";
import { AdjustingView } from "@/components/Adjusting";
import { CreateThemeForm } from "@/components/CreateThemeForm";
import { ModeTabs } from "@/components/ModeTabs";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeCard } from "@/components/ThemeCard";
import { betaLimitedPage } from "@/lib/api/admin-page";
import { PRESETS, presetCreateHref } from "@/lib/practice/presets";
import { listThemes } from "@/lib/api/themes";
import { adjustingMetadata } from "@/lib/beta/beta";
import { normalizeName } from "@henge/shared";
import { playHref } from "@/lib/ui/kind";

export const dynamic = "force-dynamic";

/**
 * **ベータ版では調整中**（まだアラが目立つため公開しない）。運営アカウントは
 * 何も変わらず使える。検索エンジンには調整中の画面を見せないため noindex を返す。
 */
export async function generateMetadata(): Promise<Metadata> {
  if (await betaLimitedPage()) return adjustingMetadata();
  return {
    title: "タイピング最適化練習 | HENGE",
    description:
      "指定した連接を必ず含む文章だけで練習できます。毎回違う文章が出るので、最適化した運指が特定の文章に紐づかず、実戦で出せるようになります。",
  };
}

/**
 * 最適化練習の一覧。テーマ一覧と**対称の構造**にする。
 *
 * 掲載順は「待たずに遊べるもの」が先。生成済みの指定は既存プールから即座に
 * 配信できるが、未生成のものはログイン＋生成待ちが要る（テーマ作成と同じ扱い）。
 */
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ char?: string }>;
}) {
  // **ベータ版では運営アカウント以外に調整中の画面を出す。** 一覧の取得や
  // 作成フォームを出さない（生成の入口ごと閉じる）
  if (await betaLimitedPage()) return <AdjustingView what="最適化練習" />;

  const { char } = await searchParams;
  const generated = await listThemes({ kind: "constraint", sort: "popular", limit: 50 });

  // プリセットが既に生成済みかは**正規化キーで照合する**。表示名の揺れ（結合濁点など）で
  // 「作成済みなのに未生成に見える」ことを防ぐ。規則は themes.normalized_name と同じもの
  const existing = new Map(
    generated.map((theme) => [normalizeName("constraint", theme.name), theme] as const),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="font-mincho text-3xl tracking-wide text-kinari">最適化練習</h1>
        <p className="mt-6 max-w-2xl leading-loose text-kinari/70">
          指定した音を必ず含む文章だけが出ます。判定は
          <strong className="text-kinari">読み仮名</strong>
          に対して行うので、表記に出ていなくても構いません（「座禅」は読み「ざぜん」に「ざ」を含みます）。
        </p>

        <div className="mt-8">
          <ModeTabs current="constraint" />
        </div>

        <section className="mt-16">
          <h2 className="text-sm tracking-[0.25em] text-kinari/50">代表的な最適化</h2>
          <p className="mt-3 text-sm text-kinari/50">
            標準運指では同じ指が続く並びです。別々の指が続くよう運指を変えると速くなります。
            すでにお題があるものは、そのまま遊べます。
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {PRESETS.map((preset) => {
              const ready = existing.get(normalizeName("constraint", preset.char));
              return (
                <li key={preset.char}>
                  <a
                    href={
                      ready === undefined
                        ? presetCreateHref(preset.char)
                        : playHref("constraint", preset.char)
                    }
                    className="flex items-center justify-between rounded-md border border-kinari/10 bg-kinari/5 px-6 py-5 transition-colors hover:border-shu/60"
                  >
                    <span className="flex items-baseline gap-4">
                      <span className="font-mincho text-2xl tracking-wide text-kinari">
                        {preset.char}
                      </span>
                      <span className="text-xs tracking-wider text-kinari/50">{preset.reason}</span>
                    </span>
                    <span className="text-xs tracking-widest text-kinari/50">
                      {ready === undefined ? "作る" : "すぐ遊べる"}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="text-sm tracking-[0.25em] text-kinari/50">みんなが作った指定</h2>
          <div className="mt-6 grid gap-3">
            {generated.map((theme) => (
              <ThemeCard key={theme.id} theme={theme} />
            ))}
            {generated.length === 0 && (
              <p className="text-kinari/50">まだ誰も作っていません。下から最初の1つを作れます。</p>
            )}
          </div>
        </section>

        <section id="create" className="mt-16 scroll-mt-8">
          <h2 className="text-sm tracking-[0.25em] text-kinari/50">自分で指定する</h2>
          <p className="mt-3 max-w-2xl text-sm leading-loose text-kinari/50">
            ひらがなで1〜4文字。判定するのが読み仮名なので、カタカナ・漢字・長音符「ー」は指定できません
            （何にも一致しないためです）。同じ指定が既にあれば、それをそのまま使います。
          </p>
          <div className="max-w-xl">
            <CreateThemeForm kind="constraint" initialName={char ?? ""} />
          </div>
        </section>
      </main>
    </>
  );
}
