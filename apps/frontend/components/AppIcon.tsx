/**
 * アプリアイコン（`app/icon.jpeg`）。ヘッダーのロゴとトップのヒーローで共有する。
 *
 * **サイズは呼び出し側が `className` で決める。** 置く場所で必要な大きさが違う。
 *
 * **マスクは元画像の都合による回避策。** JPEGなので透過が無く、地の色（#191b20）が
 * サイトの墨（#15171d）と一致しないため、そのまま置くと薄い四角が浮く。放射状の
 * マスクで縁を飛ばして地に溶かしている。**元画像を透過PNG/SVGに差し替えたら
 * このマスクごと外すこと。**
 *
 * 読み上げでは隣にワードマーク（HENGE）の文字列があるので、常に装飾として隠す。
 */
export function AppIcon({ className }: { className?: string }) {
  return (
    <img
      src="/icon.jpeg"
      alt=""
      aria-hidden="true"
      className={`block object-contain [mask-image:radial-gradient(circle,black_52%,transparent_76%)] ${className ?? ""}`}
    />
  );
}
