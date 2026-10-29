import { describe, expect, it } from "bun:test";
import { constraintCharRejection } from "@henge/shared";
import { themeNameSchema } from "@/lib/api/schema";
import { betaThemeRejection, isBetaLimitedUser, isBetaMode, isConstraintRequest } from "./beta";

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

/**
 * `POST /api/themes` のベータ版の判定（#339）。最適化は公開済みなので、**検証に失敗する
 * 音でも「調整中」で弾かず、検証の文言まで届かせる。** テーマはいまどおり弾く
 */
const limited = async () => true;

describe("betaThemeRejection", () => {
  it("ベータ版の利用者が検証に失敗する最適化の音を送ると、検証の文言が返る", async () => {
    const raw = { kind: "constraint", name: "ゃ" };
    expect(await betaThemeRejection(raw, limited)).toBeNull();
    // 判定を抜けた先で返るのは、検証の文言
    const parsed = themeNameSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(constraintCharRejection("ゃ") as string);
  });

  it("ベータ版の利用者が NG 語の入った最適化の音を送ると、検証の文言が返る", async () => {
    const raw = { kind: "constraint", name: "ちんこ" };
    expect(await betaThemeRejection(raw, limited)).toBeNull();
    const parsed = themeNameSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "この名前ではお題を作れません。別の名前でお試しください",
    );
  });

  it("ベータ版の利用者が音と合わない運指を送ると、検証の文言が返る", async () => {
    // 「き」1単位ぶんの運指を「きき」に付ける（音の切り方と合わない）
    const ki = { units: [{ roman: "ki", fingers: ["right-index", "right-middle"] }] };
    const raw = { kind: "constraint", name: "きき", fingering: ki };
    expect(await betaThemeRejection(raw, limited)).toBeNull();
    const parsed = themeNameSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("運指が最適化する音と合いません");
  });

  it("最適化ではセッションを照合しない", async () => {
    let called = false;
    const raw = { kind: "constraint", name: "き" };
    expect(
      await betaThemeRejection(raw, async () => {
        called = true;
        return true;
      }),
    ).toBeNull();
    expect(called).toBe(false);
  });

  it("テーマはいまどおり FORBIDDEN（検証に失敗する名前でも）", async () => {
    const raws = [
      { kind: "theme", name: "猫" },
      { kind: "theme", name: "" },
      { kind: "theme", name: "ちんこ" },
    ];
    const results = await Promise.all(raws.map((raw) => betaThemeRejection(raw, limited)));
    expect(results.map((res) => res?.status)).toEqual([403, 403, 403]);
    const bodies = await Promise.all(
      results.map((res) => res?.json() as Promise<{ error: { code: string } }>),
    );
    expect(bodies.map((body) => body.error.code)).toEqual(["FORBIDDEN", "FORBIDDEN", "FORBIDDEN"]);
  });

  it("kind が読めない壊れた入力はテーマ側に倒す", async () => {
    const raws = [null, "constraint", ["constraint"], {}, { kind: 1 }];
    const results = await Promise.all(raws.map((raw) => betaThemeRejection(raw, limited)));
    for (const res of results) expect(res?.status).toBe(403);
  });

  it("制限されない利用者はテーマも通す", async () => {
    expect(await betaThemeRejection({ kind: "theme", name: "猫" }, async () => false)).toBeNull();
  });
});

describe("isConstraintRequest", () => {
  it("生の入力の kind だけを見る", () => {
    expect(isConstraintRequest({ kind: "constraint", name: "ゃ" })).toBe(true);
    expect(isConstraintRequest({ kind: "theme", name: "猫" })).toBe(false);
    expect(isConstraintRequest(undefined)).toBe(false);
  });
});
