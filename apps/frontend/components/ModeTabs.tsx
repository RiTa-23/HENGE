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
    <div className="flex gap-2" role="tablist">
      {modes.map((mode) => (
        <a
          key={mode.kind}
          href={mode.href}
          role="tab"
          aria-selected={mode.kind === current}
          className={
            mode.kind === current
              ? "rounded-md border border-kin bg-kinari/5 px-6 py-2 text-sm tracking-widest text-kinari"
              : "rounded-md border border-kinari/15 px-6 py-2 text-sm tracking-widest text-kinari/50 transition-colors hover:border-kin/60 hover:text-kinari"
          }
        >
          {mode.label}
        </a>
      ))}
    </div>
  );
}
