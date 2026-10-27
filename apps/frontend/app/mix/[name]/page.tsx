import { mixWordsPerSentence, type MixName } from "@henge/shared";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DetailScroll } from "@/components/DetailScroll";
import { MixMark, mixPips } from "@/components/ModeMark";
import { RankingBoard } from "@/components/RankingBoard";
import { SealButton } from "@/components/SealButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listRankings } from "@/lib/api/rankings";
import { decodePageParam, findTheme } from "@/lib/api/themes";
import { ogFields, pageTitle } from "@/lib/og";
import { detailHref, playHref } from "@/lib/ui/kind";
import { MIX_COPY, mixModesOnPage, mixPageOf, parseMixName } from "@/lib/ui/mix";

interface Props {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ mode?: string }>;
}

/**
 * ページ名と、選ばれているモード。`?mode=` がそのページで選べないモードなら、ページの主のモード。
 * ページ名がおまかせ・ごちゃまぜの名前でなければ null
 */
async function resolve({ params, searchParams }: Props) {
  const [{ name }, { mode }] = await Promise.all([params, searchParams]);
  // ページのルートパラメータはエンコードされたまま渡ってくる
  const decoded = decodePageParam(name);
  const page = parseMixName(decoded ?? undefined);
  if (page === null) return null;
  const modes = mixModesOnPage(page);
  const requested = parseMixName(mode);
  const selected: MixName = requested !== null && modes.includes(requested) ? requested : page;
  return { page, modes, selected };
}

/** シェアの着地ページ（結果のX投稿からここへ来る。docs/09-share.md） */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const resolved = await resolve(props);
  if (resolved === null) return {};
  const title = pageTitle(`${resolved.selected}タイピング`);
  const description = MIX_COPY[resolved.selected].description;
  return { title, description, ...ogFields(title, description) };
}

export const dynamic = "force-dynamic";

/**
 * おまかせ・ごちゃまぜの詳細。テーマ詳細（/themes/[name]）と同じ構えで、**「打つ」を主役に置く**。
 * プレイ画面の「戻る」とランキング・シェアの着地先になる（`detailHref("mix", name)`）。
 *
 * **ごちゃまぜの詳細では、カオス（2語）と超カオス（3語）を切り替えて選ぶ**（`?mode=`）。
 * プール・ランキングはモードごとに別の行なので、在庫・ランキング・朱印は選んだモードのものを出す。
 * 切り替えはリンク（サーバーで描き直す）にして、共有されたURLでも同じモードが開くようにする。
 */
export default async function MixDetailPage(props: Props) {
  const resolved = await resolve(props);
  if (resolved === null) notFound();
  const { page, modes, selected } = resolved;
  // 独自のページを持たないモード（超ごちゃまぜ）の名前で来たら、それを選んだ親のページへ
  if (mixPageOf(page) !== page) permanentRedirect(detailHref("mix", page));

  // 行が無ければ Hono 側で作られる（findOrCreateMixTheme）。ここで null になるのは障害のときだけ
  const theme = await findTheme("mix", selected);
  if (theme === null) notFound();

  // 短文だけなので、ランキングも1つ
  const entries = await listRankings(theme.id, "sentence");
  const words = mixWordsPerSentence(selected) ?? 1;
  const copy = MIX_COPY[selected];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <DetailScroll
          mark={<MixMark pips={mixPips(words)} className="h-5 w-5" />}
          eyebrow={words === 1 ? copy.level : `${copy.level}モード`}
          title={page}
          description={<>{copy.description}10問ひと組で、同じ文章は繰り返し出ません。</>}
          stats={[
            { label: "お題", value: theme.promptCounts.sentence },
            { label: "プレイ", value: theme.totalPlayCount, unit: "回" },
          ]}
          actions={
            <div className="flex flex-col items-center gap-8">
              {modes.length > 1 && (
                /*
                 * **タブではなくナビゲーション。** 押すとページごと描き直す（ModeTabs と同じ考え方）。
                 * 選んだモードは aria-current で示す
                 */
                <nav className="flex flex-wrap justify-center gap-2" aria-label="カオスの度合い">
                  {modes.map((mode) => (
                    <a
                      key={mode}
                      href={detailHref("mix", mode)}
                      aria-current={mode === selected ? "page" : undefined}
                      className={
                        mode === selected
                          ? "flex shrink-0 items-center whitespace-nowrap gap-2 rounded-md border border-kin bg-kinari/5 px-4 py-2 text-sm tracking-widest text-kinari"
                          : "flex shrink-0 items-center whitespace-nowrap gap-2 rounded-md border border-kinari/15 px-4 py-2 text-sm tracking-widest text-kinari/50 transition-colors hover:border-kin/60 hover:text-kinari"
                      }
                    >
                      <MixMark pips={mixPips(mixWordsPerSentence(mode) ?? 1)} className="h-4 w-4" />
                      {MIX_COPY[mode].level}
                      <span className="text-xs text-kinari/40">{mixWordsPerSentence(mode)}語</span>
                    </a>
                  ))}
                </nav>
              )}
              {/* 形式が1つなので木札ではなく朱印（`SealButton`）。押すと選んだモードで打ち始める */}
              <SealButton
                key={selected}
                href={playHref("mix", theme.name)}
                note={modes.length > 1 ? `${copy.level}・1文に${words}語` : undefined}
                difficult={theme.generationStatus === "difficult"}
              />
            </div>
          }
        />

        <RankingBoard key={selected} boards={[{ form: "sentence", entries }]} />

        <p className="mt-10 text-sm text-kinari/50">
          <a href="/themes" className="hover:text-kinari">
            ほかのお題を見る →
          </a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
