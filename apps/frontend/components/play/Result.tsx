import { PLAY_SIZE } from "@henge/shared";
import {
  accuracyRatio,
  etypingScore,
  keysPerSecond,
  type PlayStats,
  totalKeystrokes,
} from "@/lib/play/score";

export type { PlayStats };

/**
 * 結果。**スコアは保存しない**（MVPスコープ外）ので、この場で見せて終わり。
 * 画面遷移せずプレイ画面内の状態として出す。
 *
 * スコアは e-typing と同じ算出方法（WPM ×（正確率）^3 の切り捨て）。
 * 計算は lib/play/score.ts にあり、そちらでテストしている。
 */
export function Result({
  stats,
  onRetry,
  themeName,
}: {
  stats: PlayStats;
  onRetry: () => void;
  themeName: string;
}) {
  const items = [
    { label: "打鍵速度", value: keysPerSecond(stats).toFixed(1), unit: "打鍵/秒" },
    { label: "正確率", value: `${Math.floor(accuracyRatio(stats) * 100)}`, unit: "%" },
    { label: "打鍵数", value: `${totalKeystrokes(stats)}`, unit: `打（ミス ${stats.misses}）` },
    { label: "時間", value: (stats.elapsedMs / 1000).toFixed(1), unit: "秒" },
  ];

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-lg border border-kin/60 bg-kinari/5 px-10 py-12">
        <p className="text-center text-sm tracking-widest text-kinari/60">{themeName}</p>
        <h1 className="mt-2 text-center font-mincho text-2xl tracking-widest text-kinari">
          {PLAY_SIZE}問 走破
        </h1>

        <div className="mt-10 text-center">
          <p className="text-xs tracking-[0.3em] text-kinari/50">スコア</p>
          <p className="mt-1 font-mono text-6xl leading-none text-kin">{etypingScore(stats)}</p>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <dt className="text-xs tracking-wider text-kinari/50">{item.label}</dt>
              <dd className="mt-1 font-mono text-2xl text-kinari">
                {item.value}
                <span className="ml-1 text-xs text-kinari/50">{item.unit}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-shu bg-shu/15 px-8 py-3 font-gothic tracking-widest text-kinari transition-colors hover:bg-shu/25"
          >
            もう一度
          </button>
          <a
            href="/themes"
            className="rounded-md border border-kinari/20 px-8 py-3 font-gothic tracking-widest text-kinari/80 transition-colors hover:border-kin hover:text-kinari"
          >
            ほかのお題を見る
          </a>
        </div>

        <p className="mt-8 text-center text-sm">
          <a href="/" className="tracking-widest text-kinari/50 hover:text-kinari">
            トップへ戻る
          </a>
        </p>
      </div>
    </div>
  );
}
