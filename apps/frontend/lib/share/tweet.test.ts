import { describe, expect, it } from "bun:test";
import { buildShareText, buildTweetIntentUrl } from "./tweet";

/**
 * 投稿テキストの整形。**結果画面と同じ数値が乗ること**が要件。整形ルール
 * （小数1桁・切り捨て%）が結果画面とずれると「画面と投稿が違う」になるため、
 * 期待値は lib/play/score.ts の計算結果に手で追従させた固定値を置く。
 */
describe("buildShareText", () => {
  // 550打中540打 正解、125秒。打鍵/秒 4.4、正確率 98%、スコア 249
  const stats = { hits: 540, misses: 10, elapsedMs: 125_000 };

  it("テーマモード。テーマ名・スコア・打鍵/秒・正確率を含む", () => {
    expect(buildShareText({ kind: "theme", themeName: "忍びの心得", stats })).toBe(
      `HENGEで「忍びの心得」を打った。\nスコア 249／打鍵/秒 4.4／正確率 98%\n#HENGE`,
    );
  });

  it("最適化モード。文字だけだと文として成立しないため「最適化練習」を挟む", () => {
    expect(buildShareText({ kind: "constraint", themeName: "ざ", stats })).toBe(
      `HENGEで「ざ」の最適化練習を打った。\nスコア 249／打鍵/秒 4.4／正確率 98%\n#HENGE`,
    );
  });

  it("1打もしていない結果でも、結果画面と同じ整形で落ちない", () => {
    // 正確率は1（100%）として扱われ、打鍵/秒は 0.0
    expect(
      buildShareText({
        kind: "theme",
        themeName: "忍びの心得",
        stats: { hits: 0, misses: 0, elapsedMs: 1000 },
      }),
    ).toBe(`HENGEで「忍びの心得」を打った。\nスコア 0／打鍵/秒 0.0／正確率 100%\n#HENGE`);
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
