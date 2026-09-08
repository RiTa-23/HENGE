import { describe, expect, test } from "bun:test";
import {
  GENERATION_WAIT_LIMIT_MS,
  PLAY_SIZE,
  STOCK_TARGET,
  THEME_LOCK_TTL_SECONDS,
} from "./session";

/**
 * 定数どうしの関係を固定する。**単体の値ではなく大小が仕組みの前提**になっていて、
 * 片方だけ動かすと例外もログも出ないまま壊れるものだけを置く。
 */
describe("生成ロックのTTLと、クライアントの待ち上限", () => {
  /**
   * ロックが残っている間、在庫不足のプレイには `GENERATION_IN_PROGRESS` を返して
   * 待たせる。TTLの方が長いと、生成が打ち切られた後も「待てば解決する」と
   * 言い続けたままクライアントが先に諦め、**待たせた末にエラーを見せる**。
   */
  test("ロックのTTLは待ち上限より短い", () => {
    expect(THEME_LOCK_TTL_SECONDS * 1000).toBeLessThan(GENERATION_WAIT_LIMIT_MS);
  });

  /** KVの `expirationTtl` の下限。これを下回る値は設定そのものが弾かれる */
  test("ロックのTTLはKVの下限（60秒）以上", () => {
    expect(THEME_LOCK_TTL_SECONDS).toBeGreaterThanOrEqual(60);
  });

  /**
   * 補充は `waitUntil` の中で走り、レスポンス送信から30秒で打ち切られる。
   * ロックがそれより極端に長生きしても、待たせる時間が延びるだけで意味がない。
   */
  test("ロックのTTLは、打ち切られるまでの30秒に対して過大でない", () => {
    expect(THEME_LOCK_TTL_SECONDS).toBeLessThanOrEqual(90);
  });
});

describe("在庫の目標水準", () => {
  /**
   * 30 は「2プレイ分」。補充が終わる前にもう一度遊ばれても在庫が足りる。
   * 1プレイ分を割ると、「もう一度」を押した時点で在庫切れに当たりやすくなる。
   */
  test("在庫の目標は1プレイ分より大きい", () => {
    expect(STOCK_TARGET).toBeGreaterThan(PLAY_SIZE);
  });
});
