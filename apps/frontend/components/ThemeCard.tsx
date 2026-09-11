import type { ThemeSummary } from "@/lib/api/themes";
import { detailHref, playHref } from "@/lib/ui/kind";
import "@/components/play/ninja.css";

/**
 * 一覧のテーマ／最適化する音1件。**巻物の形で出す。**
 *
 * プレイ画面の巻物をそのまま小さくしたもの（`.scroll--card`）。軸・キャップ・紙の面は
 * 同じ作りで、別の物体に見えないようにしてある。
 *
 * **最初は閉じている。** 名前が読めるだけの狭い紙に、テーマ名とプレイ回数。
 * カーソルを合わせる（またはフォーカスが入る）と紙が横にほどけて、巻かれていた側に
 * 畳まれていた「短文で打つ」「単語で打つ」が現れる。縦幅は変わらない。
 * ボタンは紙の左端から固定の位置（`left-44`＝閉じたときの紙の幅176）に置き、
 * 紙が狭い間は右の軸の下に完全に隠れる（幅の遷移は `ninja.css`）。
 * ホバーの無い端末では最初から開いている。
 *
 * 押せる場所は2種類ある。
 *
 * - **巻物そのもの** → 詳細（テーマ名のリンクを `after:` で巻物全体に広げている）
 * - **ボタン** → プレイに直行（`z-10` で上に重ねる）
 *
 * ボタンを `<a>` の中に入れないのは、リンクの中にリンクを置けないため。重ね方は
 * 「カード全体をリンクにする」ときの常套手段で、読み上げでもテーマ名のリンクと
 * ボタンが別々に辿れる。
 *
 * 最適化する音は形式が1つ（単語モードを付けない）なので、ボタンは「打つ」1つ。
 * リンク先の組み立ては `lib/ui/kind.ts` に任せる（`?kind=` `?form=` を手で書かない）。
 */
export function ThemeCard({ theme }: { theme: ThemeSummary }) {
  const isTheme = theme.kind === "theme";
  const difficult =
    theme.generationStatus === "difficult" ||
    (isTheme && theme.wordGenerationStatus === "difficult");
  const buttonClass =
    "rounded-md border border-shu/60 bg-shu/10 px-3 py-1.5 text-xs tracking-widest whitespace-nowrap text-kinari transition-colors hover:bg-shu/25";

  return (
    <article className="scroll scroll--card relative">
      <div className="scroll__roller" />
      <div className="scroll__sheet relative flex min-h-24 items-center px-4 py-3">
        {/* 閉じた巻物に見えている部分。幅は固定（--scroll-closed と合わせてある） */}
        <div className="w-36 shrink-0">
          <a
            href={detailHref(theme.kind, theme.name)}
            className="block truncate font-mincho text-lg tracking-wide text-kinari after:absolute after:inset-0 hover:text-kin"
          >
            {theme.name}
          </a>
          {/*
            **行を増やさない。** 印を別の行にすると、そのカードだけ中身の位置がずれて
            格子の中で浮く。プレイ回数と同じ行にバッジで並べる。名前の真横に置かないのは、
            閉じた紙の幅（144px）だと名前が3文字ほどで切れてしまうため
          */}
          <p className="mt-1 flex items-center gap-2 text-xs tracking-widest whitespace-nowrap text-kinari/50">
            <span>
              プレイ <span className="font-mono text-kinari/70">{theme.totalPlayCount}</span> 回
            </span>
            {difficult && (
              <span className="rounded-full border border-kinari/20 px-1.5 py-px text-[10px] leading-4 text-kinari/40">
                生成が難しい
              </span>
            )}
          </p>
        </div>

        {/* ほどけた側に現れる部分。巻物全体を覆うリンクより上に置き、ここだけプレイへ直行する */}
        <div className="absolute top-1/2 left-44 z-10 flex -translate-y-1/2 flex-col gap-1.5">
          {isTheme ? (
            (["sentence", "word"] as const).map((form) => (
              <a key={form} href={playHref(theme.kind, theme.name, form)} className={buttonClass}>
                {form === "word" ? "単語" : "短文"}で打つ
              </a>
            ))
          ) : (
            <a href={playHref(theme.kind, theme.name)} className={buttonClass}>
              打つ
            </a>
          )}
        </div>
      </div>
      <div className="scroll__roller" />
    </article>
  );
}
