import { describe, expect, it } from "bun:test";
import { denyIfNotAdmin } from "./admin-guard";

const admin = { user: { email: "rita@example.com" } };
const stranger = { user: { email: "intruder@example.com" } };
const ADMINS = "rita@example.com";

async function codeOf(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe("denyIfNotAdmin", () => {
  it("管理者は通す（null を返す）", () => {
    expect(denyIfNotAdmin(admin, ADMINS)).toBeNull();
  });

  it("未ログインは UNAUTHORIZED(401)", async () => {
    const denied = denyIfNotAdmin(null, ADMINS);

    expect(denied?.status).toBe(401);
    expect(await codeOf(denied as Response)).toBe("UNAUTHORIZED");
  });

  it("ログイン済みの非管理者は FORBIDDEN(403)", async () => {
    const denied = denyIfNotAdmin(stranger, ADMINS);

    expect(denied?.status).toBe(403);
    expect(await codeOf(denied as Response)).toBe("FORBIDDEN");
  });

  // 設定漏れで全員が管理者になるのが最悪の壊れ方。未設定は必ず閉じる側に倒す
  it("ADMIN_EMAILS が未設定なら管理者を作らない", async () => {
    expect(await codeOf(denyIfNotAdmin(admin, undefined) as Response)).toBe("FORBIDDEN");
  });

  it("ADMIN_EMAILS が空文字でも管理者を作らない", async () => {
    expect(await codeOf(denyIfNotAdmin(admin, "") as Response)).toBe("FORBIDDEN");
  });

  it("カンマ区切りの2件目でも管理者になれる", () => {
    expect(denyIfNotAdmin(admin, "other@example.com, rita@example.com")).toBeNull();
  });

  it("大文字小文字は区別しない", () => {
    expect(denyIfNotAdmin({ user: { email: "RITA@Example.com" } }, ADMINS)).toBeNull();
  });

  // FORBIDDEN の文言は NOT_FOUND と同じにして、権限が無いのか存在しないのかを
  // クライアントから区別させない
  it("FORBIDDEN の文言は「見つかりません」", async () => {
    const body = (await (denyIfNotAdmin(stranger, ADMINS) as Response).json()) as {
      error: { message: string };
    };

    expect(body.error.message).toBe("見つかりません");
  });
});
