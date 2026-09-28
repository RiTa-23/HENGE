import { describe, expect, test } from "bun:test";
import { sameSecret } from "./secret";

describe("sameSecret", () => {
  test("同じ値だけを一致とみなす", async () => {
    expect(await sameSecret("Bearer abc", "Bearer abc")).toBe(true);
    expect(await sameSecret("Bearer abd", "Bearer abc")).toBe(false);
  });

  test("長さが違っても（前方一致でも）一致にしない", async () => {
    expect(await sameSecret("Bearer ab", "Bearer abc")).toBe(false);
    expect(await sameSecret("Bearer abcd", "Bearer abc")).toBe(false);
    expect(await sameSecret("", "Bearer abc")).toBe(false);
  });
});
