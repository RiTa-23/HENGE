import { describe, expect, it } from "bun:test";
import { isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  it("一覧に含まれていれば true", () => {
    expect(isAdminEmail("rita@example.com", "rita@example.com")).toBe(true);
  });

  it("カンマ区切りの2件目以降も判定できる", () => {
    expect(isAdminEmail("b@example.com", "a@example.com,b@example.com")).toBe(true);
  });

  it("区切りごとの空白は許容する", () => {
    expect(isAdminEmail("b@example.com", "a@example.com, b@example.com")).toBe(true);
  });

  it("大文字小文字を区別しない", () => {
    expect(isAdminEmail("Rita@Example.com", "rita@example.com")).toBe(true);
  });

  it("一覧に無ければ false", () => {
    expect(isAdminEmail("intruder@example.com", "rita@example.com")).toBe(false);
  });

  it("未設定（空文字）なら誰も管理者にしない", () => {
    expect(isAdminEmail("rita@example.com", "")).toBe(false);
  });

  // 空要素を許すと、空文字のメールが管理者になりうる
  it("空要素だけの指定でも管理者を作らない", () => {
    expect(isAdminEmail("", ",, ,")).toBe(false);
  });

  it("部分一致では管理者にしない", () => {
    expect(isAdminEmail("a@example.com", "aa@example.com")).toBe(false);
  });
});
