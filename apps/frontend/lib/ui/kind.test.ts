import { describe, expect, it } from "bun:test";
import { detailHref, kindLabel, listHref, parseThemeKind, playHref } from "./kind";

/**
 * テーマ「ざ」と最適化する音「ざ」は一意制約上**共存できる**ため、名前だけでは
 * どちらを開くか決まらない。URLの kind を落とすと、静かに別のプールを開く。
 */
describe("parseThemeKind", () => {
  it("constraint だけを含むモードとして受け取る", () => {
    expect(parseThemeKind("constraint")).toBe("constraint");
  });

  it.each([undefined, "", "theme", "Constraint", "practice", "../constraint"])(
    "%p は theme に倒す",
    (value) => {
      expect(parseThemeKind(value)).toBe("theme");
    },
  );
});

describe("playHref", () => {
  it("テーマは kind を付けない", () => {
    expect(playHref("theme", "忍びの心得")).toBe(`/play/${encodeURIComponent("忍びの心得")}`);
  });

  it("最適化する音は kind=constraint を付ける", () => {
    expect(playHref("constraint", "ざ")).toBe(`/play/${encodeURIComponent("ざ")}?kind=constraint`);
  });

  it("名前をURLエンコードする", () => {
    // `%` や `?` を含む名前でパスが壊れないこと
    expect(playHref("theme", "100%の集中")).toBe("/play/100%25%E3%81%AE%E9%9B%86%E4%B8%AD");
  });
});

describe("detailHref", () => {
  it("テーマは /themes/[name]、最適化する音は /practice/[char]", () => {
    expect(detailHref("theme", "忍びの心得")).toBe(`/themes/${encodeURIComponent("忍びの心得")}`);
    expect(detailHref("constraint", "ざ")).toBe(`/practice/${encodeURIComponent("ざ")}`);
  });
});

describe("listHref / kindLabel", () => {
  it("モードごとの一覧と呼び名を返す", () => {
    expect(listHref("theme")).toBe("/themes");
    expect(listHref("constraint")).toBe("/practice");
    expect(kindLabel("theme")).toBe("このテーマ");
    expect(kindLabel("constraint")).toBe("この音");
  });
});
