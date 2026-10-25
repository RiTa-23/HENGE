import type { ThemeSummary } from "@/lib/api/themes";
import { difficultForms } from "@/components/DifficultBadge";
import { FormButton } from "@/components/FormButton";
import { detailHref, playHref } from "@/lib/ui/kind";
import "@/components/play/ninja.css";

/**
 * 一覧の最適化する音1件。**的板の形で出す**（テーマは巻物＝`ThemeCard`）。
 *
 * プレイ画面の的板（`.mato`）をそのまま小さくしたもの。的の中心を音の位置に
 * 寄せてあり（`.mato--card`）、**的のまん中に狙う音が来る**。
 *
 * 巻物のカードと違って**ほどけない**。板は開くものではないうえ、札は「打つ」1枚
 * だけなので、畳んでおく理由も無い。押せる場所の作りは巻物と同じ2種類。
 *
 * - **板そのもの** → 詳細（音のリンクを `after:` で板全体に広げている）
 * - **札** → プレイに直行（`z-10` で上に重ねる）
 */
export function MatoCard({ theme }: { theme: ThemeSummary }) {
  const difficult = difficultForms(theme);
  return (
    <article className="mato mato--card relative flex min-h-24 items-center justify-between gap-4 py-3 pr-6 pl-4">
      {/* 的の中心（--mato-center の 4.25rem）に音が来るよう、名前の欄の幅を揃える */}
      <div className="w-36 shrink-0 text-center">
        <a
          href={detailHref(theme.kind, theme.name)}
          className="block truncate font-mincho text-2xl tracking-wide text-kinari after:absolute after:inset-0 hover:text-kin"
        >
          {theme.name}
        </a>
        <p className="mt-1 text-xs tracking-widest whitespace-nowrap text-kinari/50">
          プレイ <span className="font-mono text-kinari/70">{theme.totalPlayCount}</span> 回
        </p>
      </div>

      <div className="relative z-10">
        <FormButton
          form="sentence"
          href={playHref(theme.kind, theme.name)}
          label="打つ"
          difficult={difficult.includes("sentence")}
        />
      </div>
    </article>
  );
}
