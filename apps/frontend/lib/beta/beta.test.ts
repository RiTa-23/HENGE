import { describe, expect, it } from "bun:test";
import { isBetaLimitedUser, isBetaMode } from "./beta";

/**
 * ベータ運用の判定。**「運営アカウントは何も変えない」**ことが要件の核なので、
 * 管理者・非管理者・未ログインの3系統と、フラグの解釈（"true" のときだけ有効）
 * を固定する。ここが緩いと、公開版に戻したはずの機能が一般ユーザーに見えたままになる。
 */
describe("isBetaMode", () => {
  it('"true" のときだけ有効', () => {
    expect(isBetaMode("true")).toBe(true);
  });

  it('"true" 以外は無効（公開版と同じ）', () => {
    expect(isBetaMode("false")).toBe(false);
    expect(isBetaMode("TRUE")).toBe(false);
    expect(isBetaMode("")).toBe(false);
    expect(isBetaMode(undefined)).toBe(false);
  });
});

describe("isBetaLimitedUser", () => {
  const admin = { user: { email: "rita@example.com" } };
  const stranger = { user: { email: "intruder@example.com" } };
  const ADMINS = "rita@example.com";

  // フラグを消したら元の状態に戻ることが要件。誰であっても制限されないこと
  it("ベータモードでないなら誰も制限しない", () => {
    expect(isBetaLimitedUser(undefined, stranger, ADMINS)).toBe(false);
    expect(isBetaLimitedUser(undefined, null, ADMINS)).toBe(false);
    expect(isBetaLimitedUser("false", stranger, ADMINS)).toBe(false);
  });

  it("運営アカウントは制限しない（何も変えない）", () => {
    expect(isBetaLimitedUser("true", admin, ADMINS)).toBe(false);
  });

  it("非管理者と未ログインは制限対象", () => {
    expect(isBetaLimitedUser("true", stranger, ADMINS)).toBe(true);
    expect(isBetaLimitedUser("true", null, ADMINS)).toBe(true);
  });

  // 設定漏れで全員が運営になる事故を防ぐ。denyIfNotAdmin と同じ側に倒す
  it("ADMIN_EMAILS が未設定なら誰も運営ではない", () => {
    expect(isBetaLimitedUser("true", admin, undefined)).toBe(true);
    expect(isBetaLimitedUser("true", admin, "")).toBe(true);
  });

  it("カンマ区切りの2件目でも運営になれる", () => {
    expect(isBetaLimitedUser("true", admin, "other@example.com, rita@example.com")).toBe(false);
  });
});
