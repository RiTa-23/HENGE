import type { ThemeSummary } from "@/lib/api/themes";

/**
 * 一覧のテーマ1件。**押すとプレイに直行する**（詳細を経由させない）。
 * 詳細は検索エンジンからの着地ページで、回遊の途中に挟むものではない。
 */
export function ThemeCard({ theme }: { theme: ThemeSummary }) {
  return (
    <a
      href={`/play/${encodeURIComponent(theme.name)}`}
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
