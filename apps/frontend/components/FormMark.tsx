/**
 * 出題の形式の紋。**短文と単語を見た目で見分けるための線画。**
 *
 * 「打つ」ボタンは短文も単語も朱（＝今すぐ打つべきもの）で、色では区別できない
 * （色で分けると朱の意味が薄まる）。形で分ける。モードの紋（`ModeMark`）と同じく
 * stroke＋`currentColor` の線画で、色は置く場所が決める。
 *
 * | 形式 | 紋 | 意味 |
 * |---|---|---|
 * | 短文 | 原稿用紙のマスが横に3つ | 文＝文字が並ぶ |
 * | 単語 | マスが1つ、中に点 | 語＝1つのかたまり |
 *
 * 原稿用紙にしたのは、**長さの違いが一目で分かる**ため（3マス対1マス）。
 * 巻物の開閉で表すと、一覧のカード（閉じた巻物がほどける）と意味がぶつかる。
 */
export function SentenceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="7" width="6" height="10" />
      <rect x="9" y="7" width="6" height="10" />
      <rect x="16" y="7" width="6" height="10" />
    </svg>
  );
}

export function WordMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="12" height="14" />
      {/* マスの中の1字。塗りの点で「そこに1語ある」ことを示す */}
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
