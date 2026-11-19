import { describe, expect, test } from "bun:test";
import { containsReadingProneWord } from "./reading-prone";

describe("containsReadingProneWord", () => {
  test.each([
    "カレーは辛いです",
    "カレーは辛くて美味しい",
    "残塁が少ないので風穴が開く",
    "審査に通ったホルモンは名物だ",
    "お父さんが子供を抱いている",
    "夢を抱く",
    "屋台の下で話す人々がいる",
    "博多の朝は市場が活気がある",
    "市場",
    "福岡国際機場",
    "博多站",
  ])("拾う: %s", (text) => {
    expect(containsReadingProneWord(text)).toBe(true);
  });

  test.each([
    "塩辛いスープを飲む",
    "甘辛いたれをかける",
    "香辛料を使う",
    "辛抱する",
    "介抱する",
    "荷物を抱える",
    "博多の朝は魚市場が賑わう",
    "黒門市場",
    "兵站を整える",
    "市場調査を行う",
    "風穴から音が聞こえる",
    "審査に出す",
    "机の下に置く",
  ])("拾わない: %s", (text) => {
    expect(containsReadingProneWord(text)).toBe(false);
  });
});
