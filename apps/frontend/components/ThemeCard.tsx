import type { ThemeSummary } from "@/lib/api/themes";
import { playHref } from "@/lib/ui/kind";

/**
 * 一覧のテーマ／含む文字1件。**押すとプレイに直行する**（詳細を経由させない）。
 * 詳細は検索エンジンからの着地ページで、回遊の途中に挟むものではない。
 *
 * リンク先は `playHref` に任せる。含む文字は `?kind=constraint` を伴わないと、
 * 同名のテーマ（一意制約が `(kind, normalized_name)` なので共存できる）を開く。
 */
export function ThemeCard({ theme }: { theme: ThemeSummary }) {
  return (
    <a
      href={playHref(theme.kind, theme.name)}
      className="flex items-center justify-between rounded-md border border-kinari/10 bg-kinari/5 px-6 py-5 transition-colors hover:border-shu/60"
    >
      <span className="font-mincho text-xl tracking-wide text-kinari">{theme.name}</span>
      <span className="flex items-center gap-4 text-xs tracking-widest text-kinari/50">
        <span className="font-mono">{theme.totalPlayCount} 回</span>
        {theme.generationStatus === "difficult" && (
          <span className="rounded-full border border-kinari/20 px-2 py-0.5">生成が難しい</span>
        )}
      </span>
    </a>
  );
}
