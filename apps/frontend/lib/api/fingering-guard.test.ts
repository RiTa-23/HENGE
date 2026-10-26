import { describe, expect, it } from "bun:test";
import { canEditDefaultFingering, denyIfCannotEditFingering } from "./fingering-guard";

const ADMINS = "rita@example.com";
const admin = { user: { id: "admin", email: "rita@example.com" } };
const creator = { user: { id: "u1", email: "u1@example.com" } };
const stranger = { user: { id: "u2", email: "u2@example.com" } };

async function codeOf(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe("canEditDefaultFingering", () => {
  it("作成者は変えられる", () => {
    expect(canEditDefaultFingering(creator, "u1", ADMINS)).toBe(true);
  });

  it("運営は他人の最適化も変えられる", () => {
    expect(canEditDefaultFingering(admin, "u1", ADMINS)).toBe(true);
  });

  it("作成者でも運営でもなければ変えられない", () => {
    expect(canEditDefaultFingering(stranger, "u1", ADMINS)).toBe(false);
  });

  // 作成者の無いテーマで「null === null」が通ると、誰でも変えられてしまう
  it("運営投入分（作成者 null）は運営だけ", () => {
    expect(canEditDefaultFingering(stranger, null, ADMINS)).toBe(false);
    expect(canEditDefaultFingering(admin, null, ADMINS)).toBe(true);
  });

  it("ADMIN_EMAILS が未設定なら、運営として通さない", () => {
    expect(canEditDefaultFingering(admin, "u1", undefined)).toBe(false);
    expect(canEditDefaultFingering(creator, "u1", undefined)).toBe(true);
  });

  it("未ログインは変えられない", () => {
    expect(canEditDefaultFingering(null, "u1", ADMINS)).toBe(false);
  });
});

describe("denyIfCannotEditFingering", () => {
  it("通すなら null", () => {
    expect(denyIfCannotEditFingering(creator, "u1", ADMINS)).toBeNull();
  });

  it("未ログインは UNAUTHORIZED(401)", async () => {
    const denied = denyIfCannotEditFingering(null, "u1", ADMINS);
    expect(denied?.status).toBe(401);
    expect(await codeOf(denied as Response)).toBe("UNAUTHORIZED");
  });

  it("作成者でも運営でもなければ FORBIDDEN(403)", async () => {
    const denied = denyIfCannotEditFingering(stranger, "u1", ADMINS);
    expect(denied?.status).toBe(403);
    expect(await codeOf(denied as Response)).toBe("FORBIDDEN");
  });
});
