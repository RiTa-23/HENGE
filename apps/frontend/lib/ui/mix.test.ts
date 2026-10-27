import { describe, expect, it } from "bun:test";
import { detailHref, rankingHref } from "./kind";
import { mixDetailPath, mixModesOnPage, mixPageOf, parseMixName } from "./mix";

const enc = encodeURIComponent;

describe("超ごちゃまぜはごちゃまぜの詳細で選ぶ", () => {
  it("ごちゃまぜの詳細ではカオスと超カオスを選べる。おまかせは1つだけ", () => {
    expect(mixModesOnPage("ごちゃまぜ")).toEqual(["ごちゃまぜ", "超ごちゃまぜ"]);
    expect(mixModesOnPage("おまかせ")).toEqual(["おまかせ"]);
    expect(mixPageOf("超ごちゃまぜ")).toBe("ごちゃまぜ");
  });

  it("超ごちゃまぜの詳細リンクは、3語を選んだ状態のごちゃまぜの詳細", () => {
    const path = `/mix/${enc("ごちゃまぜ")}?mode=${enc("超ごちゃまぜ")}`;
    expect(mixDetailPath("超ごちゃまぜ")).toBe(path);
    // プレイ画面の「戻る」・共有・ランキングも同じ所へ行く
    expect(detailHref("mix", "超ごちゃまぜ")).toBe(path);
    expect(rankingHref("mix", "超ごちゃまぜ")).toBe(`${path}#ranking`);
  });

  it("ページの主のモードはクエリを付けない", () => {
    expect(mixDetailPath("ごちゃまぜ")).toBe(`/mix/${enc("ごちゃまぜ")}`);
    expect(mixDetailPath("おまかせ")).toBe(`/mix/${enc("おまかせ")}`);
  });

  it("知らない名前はそのままのパス（ページ側で404）", () => {
    expect(mixDetailPath("ほかの名前")).toBe(`/mix/${enc("ほかの名前")}`);
  });
});

describe("parseMixName", () => {
  it("結合濁点の表記も NFC に揃えて受け取る", () => {
    expect(parseMixName("超ごちゃまぜ")).toBe("超ごちゃまぜ");
  });

  it("知らない名前・未指定は null", () => {
    expect(parseMixName("ざ")).toBeNull();
    expect(parseMixName(undefined)).toBeNull();
  });
});
