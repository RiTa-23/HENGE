/**
 * トップのタイトル。**ロゴを一番上に大きく出す。**
 *
 * ヘッダーの小さなロゴ（`Logo`）とは別のコンポーネントにする。大きさが違い、
 * 役割も違う（ヘッダーは「ここに戻る」導線、こちらは第一印象）。筆の下線は
 * ロゴと同じ朱の一筆（ブランドの例外）で、`h-auto` で幅に比例して太くする。
 * 固定の高さにすると縦横比が崩れ、筆致が死ぬ。
 */
export function HeroLogo() {
  return (
    <div className="inline-block">
      <span className="font-mincho text-7xl font-bold tracking-[0.18em] text-kinari sm:text-8xl">
        HENGE
      </span>
      <svg viewBox="0 0 120 8" className="mt-3 block h-auto w-full" aria-hidden="true">
        {/* 筆で払ったような下線。左が太く右へ細る。Logo と同じ一筆 */}
        <path
          d="M2 5 C 24 1.5, 60 1, 92 3 C 104 3.8, 112 4.6, 118 5.6 C 110 5.2, 96 5, 80 5.2 C 52 5.6, 22 6.4, 2 5 Z"
          fill="currentColor"
          className="text-shu"
        />
      </svg>
    </div>
  );
}
