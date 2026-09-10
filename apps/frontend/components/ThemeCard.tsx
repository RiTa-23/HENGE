import type { ThemeSummary } from "@/lib/api/themes";
import { detailHref, playHref } from "@/lib/ui/kind";

/**
 * 一覧のテーマ／最適化する音1件。
 *
 * **テーマは詳細へ、最適化する音はプレイへ送る。**
 *
 * もとはどちらもプレイに直行させていた（詳細は着地ページで、回遊の途中に挟むもの
 * ではない、という理由）。**テーマに打ち方が2つできた時点でその前提が崩れた。**
 * カードから直行させると短文か単語のどちらかを勝手に選ぶことになり、**単語モードは
 * 画面のどこからも辿れない**。形式の選択は詳細に集約してあるので、テーマは詳細へ送る。
 *
 * 最適化する音は形式が1つ（単語モードを付けない）ので直行のままでよい。選ばせる
 * ものが無い画面を1枚挟むのは、ただの遠回りになる。
 *
 * リンク先の組み立ては `lib/ui/kind.ts` に任せる。最適化する音は `?kind=constraint` を
 * 伴わないと、同名のテーマ（一意制約が `(kind, normalized_name)` なので共存できる）を開く。
 */
export function ThemeCard({ theme }: { theme: ThemeSummary }) {
  return (
    <a
      href={
        theme.kind === "constraint"
          ? playHref(theme.kind, theme.name)
          : detailHref(theme.kind, theme.name)
      }
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
