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

/**
 * 最適化練習。**三つ巴。** 音が連なって回りながら次へ次へと渡る＝連接の紋。
 *
 * 初案は鍵盤2つと運指の弧だったが、実機で見ると「何を表しているか分からない」
 * ため却下。武家の紋の体裁そのものが和風の第一印象として効く。なお一筆ずつの
 * 幅は同じ（stroke）で、頭だけを塗りつぶす。頭の向きに回転の流れが出る。
 */
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
      <g>
        <circle cx="32" cy="13" r="3.5" fill="currentColor" stroke="none" />
        <path d="M32 13 A 19 19 0 0 1 50.7 35.3" />
      </g>
      <g transform="rotate(120 32 32)">
        <circle cx="32" cy="13" r="3.5" fill="currentColor" stroke="none" />
        <path d="M32 13 A 19 19 0 0 1 50.7 35.3" />
      </g>
      <g transform="rotate(240 32 32)">
        <circle cx="32" cy="13" r="3.5" fill="currentColor" stroke="none" />
        <path d="M32 13 A 19 19 0 0 1 50.7 35.3" />
      </g>
    </svg>
  );
}
