/** 生成待ちのスピナー。回転する道具そのものを使う。色は金 */
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
      <path
        d="M50 4 L62 38 L96 50 L62 62 L50 96 L38 62 L4 50 L38 38 Z"
        fill="currentColor"
        transform="rotate(20 50 50)"
      />
      <circle cx="50" cy="50" r="7" fill="var(--color-sumi)" />
    </svg>
  );
}
