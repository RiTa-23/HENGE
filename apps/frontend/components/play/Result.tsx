import { playSize, type PromptForm, type ThemeKind } from "@henge/shared";
import { topMissedKeys } from "@/lib/play/misses";
import {
  accuracyRatio,
  etypingScore,
  keysPerSecond,
  type PlayStats,
  totalKeystrokes,
} from "@/lib/play/score";
import { buildShareText, buildTweetIntentUrl } from "@/lib/share/tweet";

export type { PlayStats };

/**
 * 結果。**スコアは保存しない**（MVPスコープ外）ので、この場で見せて終わり。
 * 画面遷移せずプレイ画面内の状態として出す。
 *
 * スコアは e-typing と同じ算出方法（WPM ×（正確率）^3 の切り捨て）。
 * 計算は lib/play/score.ts にあり、そちらでテストしている。
 */
/** 出す苦手キーの数。多すぎると「どれから直すか」が決められなくなる */
const MISSED_KEY_LIMIT = 6;

export function Result({
  stats,
  missedKeys,
  onRetry,
  themeName,
  listHref,
  kind,
  form,
  shareUrl,
}: {
  stats: PlayStats;
  /** 打ち損ねた文字と回数。1プレイ（短文15問／単語20問）の通算 */
  missedKeys: ReadonlyMap<string, number>;
  onRetry: () => void;
  themeName: string;
  /** 離脱先の一覧。テーマなら /themes、最適化する音なら /practice */
  listHref: string;
  /** 投稿テキストの文面を分けるため */
  kind: ThemeKind;
  /**
   * 出題の形式。**問題数も投稿の文面もこれで変わる。**
   * 同じテーマ名で中身が違うので、どちらの記録かを画面にも投稿にも残す。
   */
  form: PromptForm;
  /** X投稿で共有するURL（着地ページの絶対URL）。サーバー側で組み立て済み */
  shareUrl: string;
}) {
  const missed = topMissedKeys(missedKeys, MISSED_KEY_LIMIT);
  const items = [
    { label: "打鍵速度", value: keysPerSecond(stats).toFixed(1), unit: "打鍵/秒" },
    { label: "正確率", value: `${Math.floor(accuracyRatio(stats) * 100)}`, unit: "%" },
    { label: "打鍵数", value: `${totalKeystrokes(stats)}`, unit: `打（ミス ${stats.misses}）` },
    { label: "時間", value: (stats.elapsedMs / 1000).toFixed(1), unit: "秒" },
  ];

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-lg border border-kin/60 bg-kinari/5 px-10 py-12">
        <p className="flex items-center justify-center gap-3 text-sm tracking-widest text-kinari/60">
          {themeName}
          {/* **形式を出す。** テーマ名だけだと、あとから見て短文の記録か
              単語の記録か分からない */}
          <span className="rounded-full border border-kinari/20 px-3 py-0.5 text-xs text-kinari/70">
            {form === "word" ? "単語" : "短文"}
          </span>
        </p>
        <h1 className="mt-3 text-center font-mincho text-2xl tracking-widest text-kinari">
          {playSize(form)}問 走破
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

        {missed.length > 0 && (
          <div className="mt-12">
            <p className="text-center text-xs tracking-[0.3em] text-kinari/50">打ち損ねたキー</p>
            {/*
              押した誤りのキーではなく**打つべきだった文字**を出す。
              「何を打ち損ねるか」が運指の弱点そのもので、次に何を直せばよいかに繋がる
            */}
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {missed.map((item) => (
                <li
                  key={item.key}
                  className="flex items-baseline gap-2 rounded-md border border-kinari/15 bg-kinari/5 px-4 py-2"
                >
                  <span className="font-mono text-xl uppercase text-kinari">{item.key}</span>
                  <span className="font-mono text-xs text-kinari/50">{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-shu bg-shu/15 px-8 py-3 font-gothic tracking-widest text-kinari transition-colors hover:bg-shu/25"
          >
            もう一度
            <span className="ml-2 font-mono text-sm text-kinari/50">R</span>
          </button>
          <a
            href={buildTweetIntentUrl({
              url: shareUrl,
              text: buildShareText({ kind, form, themeName, stats }),
            })}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-kin/60 px-8 py-3 font-gothic tracking-widest text-kin transition-colors hover:bg-kin/10"
          >
            Xでつぶやく
          </a>
          <a
            href={listHref}
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
