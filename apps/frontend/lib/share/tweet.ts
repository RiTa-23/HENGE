import type { ThemeKind } from "@henge/shared";
import { accuracyRatio, etypingScore, keysPerSecond, type PlayStats } from "@/lib/play/score";

/**
 * 結果のX投稿。**スコアは保存しない**ので、投稿テキストは結果画面のメモリ上の
 * 値から組み立てる（docs/09-share.md）。サーバーAPIもX APIも使わない。
 *
 * **整形ルールは結果画面と同じ関数を使う。** ここで format を書き直すと
 * 「画面と投稿で数値がずれる」。小数1桁・切り捨て% は結果画面（Result.tsx）と
 * 同じ `keysPerSecond()` / `accuracyRatio()` から出す。
 */

/** 投稿テキスト。テーマ（または最適化の文字）・スコア・打鍵/秒・正確率を含む */
export function buildShareText({
  kind,
  themeName,
  stats,
}: {
  kind: ThemeKind;
  themeName: string;
  stats: PlayStats;
}): string {
  // 最適化の文字は1〜4文字のかなのため、「〜を打った」だけだと文として成立しない
  const lead =
    kind === "constraint"
      ? `HENGEで「${themeName}」の最適化練習を打った。`
      : `HENGEで「${themeName}」を打った。`;

  const line = `スコア ${etypingScore(stats)}／打鍵/秒 ${keysPerSecond(stats).toFixed(1)}／正確率 ${Math.floor(accuracyRatio(stats) * 100)}%`;

  // ハッシュタグは投稿の集計・検索のため。それ以上は280字を圧迫する
  return [lead, line, "#HENGE"].join("\n");
}

/** X の投稿画面（intent）。url パラメータのリンクは t.co に短縮されて末尾に付く */
export function buildTweetIntentUrl({ text, url }: { text: string; url: string }): string {
  const params = new URLSearchParams({ text, url });
  return `https://x.com/intent/tweet?${params.toString()}`;
}
