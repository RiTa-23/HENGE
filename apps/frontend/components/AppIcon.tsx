/**
 * アプリアイコン（`app/icon.png`）。ヘッダーのロゴとトップのヒーローで共有する。
 *
 * **サイズは呼び出し側が `className` で決める。** 置く場所で必要な大きさが違う。
 *
 * 読み上げでは隣にワードマーク（HENGE）の文字列があるので、常に装飾として隠す。
 */
export function AppIcon({ className }: { className?: string }) {
  return (
    <img
      src="/icon.png"
      alt=""
      aria-hidden="true"
      className={`block object-contain ${className ?? ""}`}
    />
  );
}
