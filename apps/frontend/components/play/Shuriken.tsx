import "./ninja.css";

/** 四方手裏剣の形。スピナーと、最適化練習で的に刺さる手裏剣（`ShurikenStrike`）で共有する */
export const SHURIKEN_PATH = "M50 4 L62 38 L96 50 L62 62 L50 96 L38 62 L4 50 L38 38 Z";

/**
 * 生成待ちのスピナー。回転する道具そのものを使う。色は金。
 *
 * **CSSはこのファイルで読む。** 他所（Loading や Scroll）任せにすると、
 * それらを使わない画面（/themes/new など）で回転も色も当たらず、
 * 銀色の手裏剣が止まったまま出る。
 */
export function Shuriken({ size = 64 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="shuriken"
      role="img"
      aria-label="読み込み中"
    >
      <path d={SHURIKEN_PATH} fill="currentColor" transform="rotate(20 50 50)" />
      <circle cx="50" cy="50" r="7" fill="var(--color-sumi)" />
    </svg>
  );
}
