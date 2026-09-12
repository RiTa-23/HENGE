import { PROMPT_FORMS } from "@henge/shared";
import type { ThemeSummary } from "@/lib/api/themes";
import { difficultForms } from "@/components/DifficultBadge";
import { FormButton } from "@/components/FormButton";
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
 * 畳まれていた「短文」「単語」の札が現れる。縦幅は変わらない。
 * 木札は紙の左端から固定の位置（`left-40`＝閉じたときの紙の幅160）から右端までの領域に
 * **上下左右の余白が揃うように中央揃え**で並べる。`justify-center-safe` なのは、紙が狭い間
 * （領域の幅が札より小さい間）は中央揃えが左にはみ出して名前に重なるため。その間は
 * 左端（＝右の軸の下）に留まって隠れる（幅の遷移は `ninja.css`）。
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
 * テーマは単語・短文・長文の3枚（短いものから）。縦長の札が収まる高さを紙に持たせる
 * （`min-h-32`。紙は `overflow: hidden` なので、足りないと札の下が切れる）。
 * 最適化する音は形式が1つ（単語・長文を付けない）なので、ボタンは「打つ」1つ。
 * リンク先の組み立ては `lib/ui/kind.ts` に任せる（`?kind=` `?form=` を手で書かない）。
 */
export function ThemeCard({ theme }: { theme: ThemeSummary }) {
  const isTheme = theme.kind === "theme";
  const difficult = difficultForms(theme);
  return (
    <article className="scroll scroll--card relative">
      <div className="scroll__roller" />
      <div
        className={
          "scroll__sheet relative flex items-center px-4 py-3 " +
          (isTheme ? "min-h-32" : "min-h-24")
        }
      >
        {/* 閉じた巻物に見えている部分。幅は固定（--scroll-closed と合わせてある） */}
        <div className="w-32 shrink-0">
          <a
            href={detailHref(theme.kind, theme.name)}
            className="block truncate font-mincho text-lg tracking-wide text-kinari after:absolute after:inset-0 hover:text-kin"
          >
            {theme.name}
          </a>
          {/* 「生成困難」はここに出さない。その形式の札を暗くして示す（FormButton の difficult） */}
          <p className="mt-1 text-xs tracking-widest whitespace-nowrap text-kinari/50">
            プレイ <span className="font-mono text-kinari/70">{theme.totalPlayCount}</span> 回
          </p>
        </div>

        {/* ほどけた側に現れる部分。巻物全体を覆うリンクより上に置き、ここだけプレイへ直行する */}
        <div className="absolute inset-y-0 left-40 right-0 z-10 flex items-center justify-center-safe gap-2">
          {isTheme ? (
            PROMPT_FORMS.map((form) => (
              <FormButton
                key={form}
                form={form}
                href={playHref(theme.kind, theme.name, form)}
                difficult={difficult.includes(form)}
              />
            ))
          ) : (
            <FormButton
              form="sentence"
              href={playHref(theme.kind, theme.name)}
              label="打つ"
              difficult={difficult.includes("sentence")}
            />
          )}
        </div>
      </div>
      <div className="scroll__roller" />
    </article>
  );
}
