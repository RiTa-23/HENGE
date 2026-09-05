/** 左上のロゴ。朱の一筆で下線を引く（HENGE の唯一の朱の例外＝ブランド） */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="inline-block">
      <span className="font-mincho text-3xl font-bold tracking-[0.18em] text-kinari">HENGE</span>
      <svg viewBox="0 0 120 8" className="mt-1 block h-2 w-full" aria-hidden="true">
        {/* 筆で払ったような下線。左が太く右へ細る */}
        <path
          d="M2 5 C 24 1.5, 60 1, 92 3 C 104 3.8, 112 4.6, 118 5.6 C 110 5.2, 96 5, 80 5.2 C 52 5.6, 22 6.4, 2 5 Z"
          fill="currentColor"
          className="text-shu"
        />
      </svg>
    </a>
  );
}
