import { describe, expect, it } from "bun:test";
import {
  detailHref,
  formLabel,
  kindLabel,
  listHref,
  parsePlayForm,
  parseThemeKind,
  playHref,
  rankingHref,
} from "./kind";

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

describe("出題の形式とURL", () => {
  /**
   * **短文にクエリを付けない。** 付けると、これまでに共有された `/play/福岡` と
   * 見た目の違うURLが2つ並ぶことになる（中身は同じ）。
   */
  it("短文はクエリを付けない", () => {
    expect(playHref("theme", "福岡", "sentence")).toBe("/play/%E7%A6%8F%E5%B2%A1");
    expect(playHref("theme", "福岡")).toBe("/play/%E7%A6%8F%E5%B2%A1");
  });

  it("単語だけ form=word を付ける", () => {
    expect(playHref("theme", "福岡", "word")).toBe("/play/%E7%A6%8F%E5%B2%A1?form=word");
  });

  it("kind と form は両方載る", () => {
    expect(playHref("constraint", "ざ", "word")).toBe("/play/%E3%81%96?kind=constraint&form=word");
  });

  // 存在しないプールを引かせない
  it("未知の形式は短文に倒す", () => {
    expect(parsePlayForm(undefined)).toBe("sentence");
    expect(parsePlayForm("poem")).toBe("sentence");
    expect(parsePlayForm("word")).toBe("word");
    expect(parsePlayForm("long")).toBe("long");
  });

  it("画面に出す呼び名", () => {
    expect(formLabel("word")).toBe("単語");
    expect(formLabel("sentence")).toBe("短文");
    expect(formLabel("long")).toBe("長文");
  });

  it("長文は form=long を付ける", () => {
    expect(playHref("theme", "福岡", "long")).toBe("/play/%E7%A6%8F%E5%B2%A1?form=long");
    expect(rankingHref("theme", "福岡", "long")).toBe(
      "/themes/%E7%A6%8F%E5%B2%A1?ranking=long#ranking",
    );
  });
});

describe("rankingHref", () => {
  it("詳細ページの #ranking へ飛ぶ。短文はクエリを付けない", () => {
    expect(rankingHref("theme", "忍びの心得")).toBe(
      `/themes/${encodeURIComponent("忍びの心得")}#ranking`,
    );
  });

  it("単語は ?ranking=word でそちらのタブを開く", () => {
    expect(rankingHref("theme", "忍びの心得", "word")).toBe(
      `/themes/${encodeURIComponent("忍びの心得")}?ranking=word#ranking`,
    );
  });

  it("最適化する音は /practice の下", () => {
    expect(rankingHref("constraint", "ざ")).toBe(`/practice/${encodeURIComponent("ざ")}#ranking`);
  });
});
