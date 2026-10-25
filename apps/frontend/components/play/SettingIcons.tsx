/**
 * 設定スイッチ（`SettingToggle`）の頭に置く印。**何の設定かを文字を読む前に伝える。**
 *
 * 3つのスイッチは形が同じなので、名前の文字だけでは見分けるのに読む手間が要る。
 * 形式の紋（`FormMark`）と同じく stroke＋`currentColor` の線画で、色は置く場所が決める。
 *
 * | 設定 | 印 |
 * |---|---|
 * | 効果音 | スピーカー。鳴るときは音の波、消したときは × |
 * | 運指 | 指さす手 |
 * | 大文字 | 「Aa」 |
 *
 * 効果音だけ入/切で形を変える（波と ×）。消音の印は広く通じる約束で、
 * 形を見るだけで「いま鳴らない」が分かる。
 */

const STROKE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function SoundIcon({ on, className }: { on: boolean; className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M3.5 9.5h3.5l4.5-4v13l-4.5-4H3.5z" />
      {on ? (
        <>
          <path d="M15 9.5a3.5 3.5 0 0 1 0 5" />
          <path d="M17.5 7a7 7 0 0 1 0 10" />
        </>
      ) : (
        <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
      )}
    </svg>
  );
}

/** 人差し指を立てた手。ほかの指は握り込んでいる */
export function FingerIcon({ className }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M9 13.5V4.5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M12 10.5a1.5 1.5 0 0 1 3 0v1" />
      <path d="M15 11.5a1.5 1.5 0 0 1 3 0v1" />
      <path d="M18 12.5a1.5 1.5 0 0 1 3 0v2.5a6.5 6.5 0 0 1-6.5 6.5h-1.5a5.5 5.5 0 0 1-4.3-2.1l-3.3-4a1.5 1.5 0 0 1 2.3-1.9l2.3 2.5" />
    </svg>
  );
}

/** 大文字と小文字を並べた「Aa」 */
export function CaseIcon({ className }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      {/* A */}
      <path d="M2.5 18.5l4.5-13 4.5 13M4.3 13.5h5.4" />
      {/* a */}
      <path d="M20.5 11v7.5" />
      <circle cx="17.25" cy="15.25" r="3.25" />
    </svg>
  );
}
