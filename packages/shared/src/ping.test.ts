import { describe, expect, test } from "bun:test";
import { ping, PING } from "./index";

describe("ping", () => {
  test("呼び出し元の名前を付けて返す", () => {
    expect(ping("frontend")).toBe("henge:frontend");
  });

  test("PING は共有定数として公開されている", () => {
    expect(PING).toBe("henge");
  });
});
