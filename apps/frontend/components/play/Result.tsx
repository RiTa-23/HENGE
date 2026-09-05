import { PLAY_SIZE } from "@henge/shared";

export interface PlayStats {
  /** 正しく受理された打鍵の総数 */
  hits: number;
  /** ミス打鍵の延べ回数 */
  misses: number;
  /** 15問にかかった時間（ミリ秒） */
  elapsedMs: number;
}

/** 1分あたりの打鍵数 */
function keysPerMinute({ hits, elapsedMs }: PlayStats): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((hits / elapsedMs) * 60_000);
}

function accuracyPercent({ hits, misses }: PlayStats): number {
  const total = hits + misses;
  return total === 0 ? 100 : Math.round((hits / total) * 100);
}

/**
 * 結果。**スコアは保存しない**（MVPスコープ外）ので、この場で見せて終わり。
 * 画面遷移せずプレイ画面内の状態として出す。
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
    { label: "打鍵速度", value: `${keysPerMinute(stats)}`, unit: "打/分" },
    { label: "正確率", value: `${accuracyPercent(stats)}`, unit: "%" },
    { label: "ミス", value: `${stats.misses}`, unit: "回" },
    { label: "時間", value: (stats.elapsedMs / 1000).toFixed(1), unit: "秒" },
  ];

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-lg border border-kin/60 bg-kinari/5 px-10 py-12">
        <p className="text-center text-sm tracking-widest text-kinari/60">{themeName}</p>
        <h1 className="mt-2 text-center font-mincho text-3xl tracking-widest text-kinari">
          {PLAY_SIZE}問 走破
        </h1>

        <dl className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <dt className="text-xs tracking-wider text-kinari/50">{item.label}</dt>
              <dd className="mt-1 font-mono text-3xl text-kin">
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
