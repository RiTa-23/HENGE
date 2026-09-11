import { describe, expect, test } from "bun:test";
import {
  GENERATION_WAIT_LIMIT_MS,
  PLAY_SIZE,
  PLAY_SIZE_WORD,
  playSize,
  STOCK_TARGET,
  STOCK_TARGET_WORD,
  stockTarget,
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

describe("出題の形式ごとの値", () => {
  test("単語の1プレイは短文より多い", () => {
    // 単語は1語8打前後。短文と同じ15問だと20秒ほどで終わってしまう
    expect(playSize("word")).toBe(PLAY_SIZE_WORD);
    expect(playSize("word")).toBeGreaterThan(playSize("sentence"));
  });

  test("既定（短文）は今までの値のまま", () => {
    expect(playSize("sentence")).toBe(PLAY_SIZE);
    expect(stockTarget("sentence")).toBe(STOCK_TARGET);
  });

  /**
   * **これが逆転すると、単語の補充は1回目から必ず失敗する。**
   * 補充が1回で作れるのは最大40件（20件×2ラウンド）。在庫0からそれを超える
   * 目標を掲げると、目標未達を理由に `generation_status='difficult'` が立ち、
   * 普通のテーマの補充が以後止まる。
   */
  test("単語の在庫目標は、1回の補充で作れる上限（40件）を超えない", () => {
    expect(stockTarget("word")).toBeLessThanOrEqual(40);
  });

  test("単語の在庫目標は2プレイ分にしない（上と同じ理由）", () => {
    expect(stockTarget("word")).toBe(STOCK_TARGET_WORD);
    expect(stockTarget("word")).toBeLessThan(playSize("word") * 2);
  });
});
