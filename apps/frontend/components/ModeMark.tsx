/**
 * 2つのモード（テーマ／最適化）の紋。トップの選択カードに置く。
 *
 * **プレイ画面のモチーフは流用しない。** 手裏剣＝スピナー、苦無＝次に打つ文字を
 * 指すキャレット、撒菱＝ミス、という意味が決まっている（docs/07-ui.md）。
 * 別の場所で静かに置くと、その意味が薄まり「回るはずの手裏剣が止まっている」
 * 「ミスでもないのに撒菱がある」ように見える。紋は**新しい線画**で描く。
 *
 * 紋は装飾ではなく識別の役割。**どちらのモードで何が起きるかを一瞬で伝える**
 * ため、それぞれのモードのプレイ画面と対応づけられる形にする。
 *
 * 線画は stroke で描き、`currentColor` を使う。色はカード側が制御する
 * （ホバーで浮かせる。ここで色を決めない）。
 */

/**
 * テーマで打つ。**巻物。** 題材の文章を通しで読んで打つモード。
 *
 * 「何のアイコンか分からない」とならないよう、巻物の構成要素をそのまま描く:
 * **両端の軸（丸い円柱）と、軸より細く外側に飛び出るキャップ、間に広がる紙。**
 * キャップが軸より細いのはプレイ画面の巻物（docs/07-ui.md）と同じ構え。
 */
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
      {/* 両端の軸（丸みのある円柱） */}
      <rect x="10" y="12" width="12" height="40" rx="6" />
      <rect x="42" y="12" width="12" height="40" rx="6" />
      {/* 軸より細く、上下に飛び出るキャップ */}
      <rect x="12" y="6" width="8" height="7" rx="2" />
      <rect x="12" y="51" width="8" height="7" rx="2" />
      <rect x="44" y="6" width="8" height="7" rx="2" />
      <rect x="44" y="51" width="8" height="7" rx="2" />
      {/* 間に広がる紙と、読み進める文章の行 */}
      <rect x="22" y="20" width="20" height="24" />
      <path d="M28 29 h8" />
      <path d="M28 36 h5" />
    </svg>
  );
}

/**
 * 最適化練習。**的（まと）。** 指定した音を狙い、繰り返し打ち込む修行。
 *
 * 「1つの連接に狙いを絞る」仕様とそのまま対応する。手裏剣の的でありながら
 * 手裏剣そのものは描かない（手裏剣＝スピナーの意味を薄めない）。同心円なので
 * 小さいサイズでも崩れない。
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
      <circle cx="32" cy="32" r="26" />
      <circle cx="32" cy="32" r="16" />
      {/* 的心。塗りつぶして狙いの位置を示す */}
      <circle cx="32" cy="32" r="6" fill="currentColor" stroke="none" />
    </svg>
  );
}
