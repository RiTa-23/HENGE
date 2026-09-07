import { describe, expect, test } from "bun:test";
import { mergeMissedKeys, topMissedKeys } from "./misses";

describe("mergeMissedKeys", () => {
  test("問題をまたいで足し合わせる", () => {
    const merged = mergeMissedKeys(
      new Map([
        ["k", 2],
        ["a", 1],
      ]),
      new Map([
        ["k", 3],
        ["s", 1],
      ]),
    );

    expect([...merged].toSorted()).toEqual([
      ["a", 1],
      ["k", 5],
      ["s", 1],
    ]);
  });

  test("元の Map を書き換えない（stateをそのまま渡すため）", () => {
    const total = new Map([["k", 1]]);
    mergeMissedKeys(total, new Map([["k", 9]]));

    expect(total.get("k")).toBe(1);
  });

  test("空同士なら空", () => {
    expect([...mergeMissedKeys(new Map(), new Map())]).toEqual([]);
  });
});

describe("topMissedKeys", () => {
  test("多い順に上位を取る", () => {
    const top = topMissedKeys(
      new Map([
        ["a", 1],
        ["k", 5],
        ["s", 3],
      ]),
      2,
    );

    expect(top).toEqual([
      { key: "k", count: 5 },
      { key: "s", count: 3 },
    ]);
  });

  test("同数はキーの順で並べる（実行ごとに並びが変わると前回と比べられない）", () => {
    const top = topMissedKeys(
      new Map([
        ["s", 2],
        ["a", 2],
        ["k", 2],
      ]),
      3,
    );

    expect(top.map((item) => item.key)).toEqual(["a", "k", "s"]);
  });

  test("ミスが無ければ空", () => {
    expect(topMissedKeys(new Map(), 5)).toEqual([]);
  });
});
