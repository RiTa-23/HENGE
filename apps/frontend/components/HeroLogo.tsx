import { HeroMark } from "./HeroMark";

/**
 * トップのタイトル。**アイコン＋ワードマークを縦に積んで、一番大きく出す。**
 *
 * ヘッダーの `Logo`（横並び）とは別のコンポーネントにする。大きさが違い、
 * 役割も違う（ヘッダーは「ここに戻る」導線、こちらは第一印象）。
 *
 * **ワードマークの下に朱の一筆を引かない。** 朱はアイコンの弧が担う。両方置くと
 * 朱の一筆が縦に2本並ぶ（docs/07-ui.md）。
 *
 * アイコンは動く（`HeroMark`）。ヘッダーの `Logo` は静止のまま。
 */
export function HeroLogo() {
  return (
    <div className="inline-block">
      <HeroMark className="mx-auto mb-4 h-40 w-40 sm:h-48 sm:w-48" />
      {/* **段階ではなく画面幅に比例させる。** 320px では text-7xl のワードマークが
          351px になり、使える幅（272px）を超えて横スクロールが出る。sm(640px) で
          段階的に切り替えると、その手前の幅が必ず溢れる */}
      <span className="font-mincho text-[clamp(2.6rem,12vw,6rem)] font-bold tracking-[0.18em] text-kinari">
        HENGE
      </span>
    </div>
  );
}
