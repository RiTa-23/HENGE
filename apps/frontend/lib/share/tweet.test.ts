import { describe, expect, it } from "bun:test";
import { buildShareText, buildTweetIntentUrl } from "./tweet";

/**
 * 投稿テキストの整形。**結果画面と同じ数値が乗ること**が要件。整形ルール
 * （小数1桁・切り捨て%）が結果画面とずれると「画面と投稿が違う」になるため、
 * 期待値は packages/shared/src/score.ts の計算結果に手で追従させた固定値を置く。
 */
describe("buildShareText", () => {
  // 550打中540打 正解、125秒。打鍵/秒 4.4、正確率 98%、スコア 249
  const stats = { hits: 540, misses: 10, elapsedMs: 125_000 };

  it("テーマモード（短文）。テーマ名・形式・スコア・打鍵/秒・正確率を含む", () => {
    expect(
      buildShareText({ kind: "theme", form: "sentence", themeName: "忍びの心得", stats }),
    ).toBe(`HENGEで「忍びの心得」の短文を打った。\nスコア 249／打鍵/秒 4.4／正確率 98%\n#HENGE`);
  });

  /**
   * **短文も単語も明記する。** 同じテーマ名で中身も問題数も違うので、書かないと
   * どちらの記録か分からない。単語のときだけ書くと「書いていない＝短文」という
   * 読み方を求めることになる。
   */
  it("テーマモード（単語）。形式の表記が短文と変わる", () => {
    expect(buildShareText({ kind: "theme", form: "word", themeName: "忍びの心得", stats })).toBe(
      `HENGEで「忍びの心得」の単語を打った。\nスコア 249／打鍵/秒 4.4／正確率 98%\n#HENGE`,
    );
  });

  it("最適化モード。文字だけだと文として成立しないため「最適化練習」を挟む", () => {
    // 最適化練習に単語モードは無いので、形式を書き足さない
    expect(buildShareText({ kind: "constraint", form: "sentence", themeName: "ざ", stats })).toBe(
      `HENGEで「ざ」の最適化練習を打った。\nスコア 249／打鍵/秒 4.4／正確率 98%\n#HENGE`,
    );
  });

  it("1打もしていない結果でも、結果画面と同じ整形で落ちない", () => {
    // 正確率は1（100%）として扱われ、打鍵/秒は 0.0
    expect(
      buildShareText({
        kind: "theme",
        form: "sentence",
        themeName: "忍びの心得",
        stats: { hits: 0, misses: 0, elapsedMs: 1000 },
      }),
    ).toBe(`HENGEで「忍びの心得」の短文を打った。\nスコア 0／打鍵/秒 0.0／正確率 100%\n#HENGE`);
  });
});

describe("buildTweetIntentUrl", () => {
  it("text と url をエンコードして intent URL に載せる", () => {
    const url = buildTweetIntentUrl({
      text: "まだ存在しない\n文章を、打つ。",
      url: "https://henge.example/themes/忍びの心得",
    });

    expect(url.startsWith("https://x.com/intent/tweet?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("text")).toBe("まだ存在しない\n文章を、打つ。");
    expect(params.get("url")).toBe("https://henge.example/themes/忍びの心得");
  });
});
