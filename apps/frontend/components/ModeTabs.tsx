import type { ThemeKind } from "@henge/shared";

/**
 * テーマモードと最適化モードの切替。**排他**（どちらか一方）。
 *
 * 組み合わせ可能にすると「テーマ × 最適化する音」ごとに別プールが必要になり、
 * 生成回数とYahoo APIの消費が組合せ的に増える（docs/05-generation.md）。
 * 排他であることを画面でも見せるため、タブで並べて片方だけを選ばせる。
 */
export function ModeTabs({ current }: { current: ThemeKind }) {
  const modes = [
    { kind: "theme", href: "/themes", label: "テーマで打つ" },
    { kind: "constraint", href: "/practice", label: "最適化練習" },
  ] as const;

  return (
    /*
     * **タブではなくナビゲーション。** role="tab" を付けると読み上げは
     * 「タブ2個中1個目」になるが、実際は押すとページごと遷移する。
     * 対応する tabpanel も無い。aria-current="page" が実態に合う
     */
    <nav className="flex gap-2" aria-label="練習モード">
      {modes.map((mode) => (
        <a
          key={mode.kind}
          href={mode.href}
          aria-current={mode.kind === current ? "page" : undefined}
          className={
            mode.kind === current
              ? "rounded-md border border-kin bg-kinari/5 px-6 py-2 text-sm tracking-widest text-kinari"
              : "rounded-md border border-kinari/15 px-6 py-2 text-sm tracking-widest text-kinari/50 transition-colors hover:border-kin/60 hover:text-kinari"
          }
        >
          {mode.label}
        </a>
      ))}
    </nav>
  );
}
