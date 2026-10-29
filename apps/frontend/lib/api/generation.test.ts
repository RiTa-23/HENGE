import { DAILY_NEURON_LIMIT } from "@henge/shared";
import { describe, expect, test } from "bun:test";
import { generationResponse } from "./generation";

const readBody = async (res: Response): Promise<unknown> => res.json();

const failed = { error: { code: "GENERATION_FAILED", message: "お題を作れませんでした" } };

describe("generationResponse", () => {
  test("成功なら、呼ぶ前の消費にその回の消費を足した残りを返す", async () => {
    const res = generationResponse(
      { ok: true, status: 200 },
      { created: true, neuronsUsed: 6 },
      10,
    );

    expect(await readBody(res)).toEqual({
      created: true,
      neuronsUsed: 6,
      neuronsRemaining: DAILY_NEURON_LIMIT - 16,
    });
  });

  test("既存テーマの再利用（neuronsUsed なし）は消費0として残りを返す", async () => {
    const res = generationResponse({ ok: true, status: 200 }, { created: false }, 10);

    expect(((await res.json()) as { neuronsRemaining: number }).neuronsRemaining).toBe(
      DAILY_NEURON_LIMIT - 10,
    );
  });

  /** **失敗でも消費は確定している**（不変条件11）。表示がずれると、残っているのに QUOTA_EXCEEDED になる */
  test("失敗でも neuronsUsed があれば、error の外に残りを足してステータスを保つ", async () => {
    const res = generationResponse({ ok: false, status: 422 }, { ...failed, neuronsUsed: 13 }, 10);

    expect(res.status).toBe(422);
    expect(await readBody(res)).toEqual({
      ...failed,
      neuronsUsed: 13,
      neuronsRemaining: DAILY_NEURON_LIMIT - 23,
    });
  });

  test("AIを呼ぶ前の失敗（neuronsUsed なし）は本文をそのまま返す", async () => {
    const locked = { error: { code: "GENERATION_IN_PROGRESS", message: "生成中です" } };
    const res = generationResponse({ ok: false, status: 409 }, locked, 10);

    expect(res.status).toBe(409);
    expect(await readBody(res)).toEqual(locked);
  });
});
