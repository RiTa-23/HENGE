import { AppIcon } from "./AppIcon";

/**
 * 左上のロゴ。**アイコン＋ワードマーク**の横並び。トップのヒーロー（`HeroLogo`）
 * と構成は同じで、大きさと並びだけが違う。
 *
 * **ワードマークの下に朱の一筆を引かない。** 朱はアイコンの弧が担う（docs/07-ui.md）。
 *
 * `beta` のときは横に「ベータ版」を出す。**アンカーの外側に置く。**
 * バッジは表示であって操作ではないので、リンクの内側に不要。
 *
 * **狭い画面ではバッジを出さない。** ロゴだけで280px（うちバッジ78px）あり、
 * 375px幅では入らない。バッジは表示であって操作ではないので、幅が足りないときに
 * 最初に落とす。ブランド名は残るので「ここが何のサイトか」は伝わる。
 *
 * **外側の `shrink-0` を外さない。** 縮むのを許すと、バッジが出ている幅で
 * ワードマークに重なる。
 *
 * このpropは**クライアントコンポーネント（PlayScreen）からも渡れる**よう
 * 単純なbooleanにしている。判定そのものはサーバー側の `betaBadgeVisible()`
 * （envだけを見る。運営にも見せる。lib/beta/beta.ts）。
 */
export function Logo({ href = "/", beta = false }: { href?: string; beta?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-3">
      <a href={href} className="inline-flex items-center gap-2">
        <AppIcon className="h-9 w-9 sm:h-11 sm:w-11" />
        <span className="font-mincho text-3xl font-bold tracking-[0.18em] text-kinari">HENGE</span>
      </a>
      {beta && (
        <span className="hidden rounded border border-kin/60 px-2 py-0.5 text-xs tracking-[0.25em] text-kin sm:inline-block">
          ベータ版
        </span>
      )}
    </span>
  );
}
