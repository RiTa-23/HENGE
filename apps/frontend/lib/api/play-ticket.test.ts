import { describe, expect, test } from "bun:test";
import {
  PLAY_TICKET_TTL_MS,
  type PlayTicket,
  signPlayTicket,
  verifyPlayTicket,
} from "./play-ticket";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;

const ticket: PlayTicket = {
  v: 1,
  jti: "j1",
  themeId: "t1",
  form: "sentence",
  promptIds: ["p1", "p2"],
  iat: NOW - 60_000,
};

describe("プレイチケット", () => {
  test("署名したチケットは、そのまま読み戻せる", async () => {
    const token = await signPlayTicket(ticket, SECRET);
    expect(await verifyPlayTicket(token, SECRET, { now: NOW, userId: "u1" })).toEqual({ ticket });
  });

  test("中身を書き換えると署名が合わず弾く（お題IDの差し替え・発行時刻の繰り上げ）", async () => {
    const token = await signPlayTicket(ticket, SECRET);
    const [, signature] = token.split(".");
    const forged = [
      { ...ticket, promptIds: ["p9", "p2"] },
      { ...ticket, iat: ticket.iat - 3_600_000 },
    ].map((body) => `${Buffer.from(JSON.stringify(body)).toString("base64url")}.${signature}`);
    const results = await Promise.all(
      forged.map((forgedToken) =>
        verifyPlayTicket(forgedToken, SECRET, { now: NOW, userId: "u1" }),
      ),
    );
    for (const result of results) expect(result).toHaveProperty("rejection");
  });

  test("別の鍵で署名したものは弾く", async () => {
    const token = await signPlayTicket(ticket, "other-secret");
    expect(await verifyPlayTicket(token, SECRET, { now: NOW, userId: "u1" })).toHaveProperty(
      "rejection",
    );
  });

  test("形の壊れた文字列は例外にせず弾く", async () => {
    const results = await Promise.all(
      ["", "abc", "a.b.c", "a.!!!", "x.y"].map((token) =>
        verifyPlayTicket(token, SECRET, { now: NOW, userId: "u1" }),
      ),
    );
    for (const result of results) expect(result).toHaveProperty("rejection");
  });

  test("発行から2時間を過ぎたら弾く", async () => {
    const token = await signPlayTicket({ ...ticket, iat: NOW - PLAY_TICKET_TTL_MS - 1 }, SECRET);
    expect(await verifyPlayTicket(token, SECRET, { now: NOW, userId: "u1" })).toEqual({
      rejection: "遊んでから2時間を過ぎた記録は登録できません",
    });
  });

  test("ログイン中に発行したチケットは、本人しか使えない", async () => {
    const token = await signPlayTicket({ ...ticket, uid: "u1" }, SECRET);
    expect(await verifyPlayTicket(token, SECRET, { now: NOW, userId: "u1" })).toHaveProperty(
      "ticket",
    );
    expect(await verifyPlayTicket(token, SECRET, { now: NOW, userId: "u2" })).toHaveProperty(
      "rejection",
    );
  });

  test("匿名で発行したチケット（uid なし）は、ログインした誰でも登録できる", async () => {
    const token = await signPlayTicket(ticket, SECRET);
    expect(await verifyPlayTicket(token, SECRET, { now: NOW, userId: "u2" })).toHaveProperty(
      "ticket",
    );
  });
});
