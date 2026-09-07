/**
 * 2つのモード（テーマ／最適化）の紋。トップの選択カードに置く。
 *
 * **プレイ画面のモチーフは流用しない。** 手裏剣＝スピナー、苦無＝次に打つ文字を
 * 指すキャレット、撒菱＝ミス、という意味が決まっている（docs/07-ui.md）。
 * 別の場所で静かに置くと、その意味が薄まり「回るはずの手裏剣が止まっている」
 * 「ミスでもないのに撒菱がある」ように見える。紋は**新しい線画**で描く。
 *
 * 紋は装飾ではなく識別の役割。**どちらのモードで何が起きるかを一瞬で伝える**
 * ため、それぞれのモードの.play画面と対応づけられる形にする。
 *
 * 線画は stroke で描き、`currentColor` を使う。色はカード側が制御する
 * （ホバーで浮かせる。ここで色を決めない）。
 */

/** テーマで打つ。**巻物と文章の線。** 題材の文章を通しで読んで打つモード */
export function ThemeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 巻かれた軸（上下にキャップ）と、広げた紙 */}
      <path d="M14 16 v32" />
      <path d="M50 16 v32" />
      <circle cx="14" cy="13" r="3" />
      <circle cx="14" cy="51" r="3" />
      <circle cx="50" cy="13" r="3" />
      <circle cx="50" cy="51" r="3" />
      <rect x="14" y="18" width="36" height="28" />
      {/* 読み進める文章の行 */}
      <path d="M23 28 h18" />
      <path d="M23 36 h12" />
    </svg>
  );
}

/** 最適化練習。**鍵盤2つと、その間を弧を描いて渡る運指。** 指の通り道を組み替えるモード */
export function PracticeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 打つ順に鍵盤を渡る弧。同じ指が続く並びを、別々の指に組み替える */}
      <path d="M18 34 C 18 16, 46 16, 46 30" />
      <path d="M40 26 L46 31 L39 34" />
      <rect x="9" y="36" width="18" height="14" rx="3" />
      <rect x="37" y="36" width="18" height="14" rx="3" />
    </svg>
  );
}
