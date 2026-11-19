import { remainingNeurons } from "@henge/shared";

/**
 * 同期生成（`POST /api/themes`・`POST /api/prompts/regenerate`）の Hono 応答に、
 * 本日の残ニューロン（`neuronsRemaining`）を足して返す。
 *
 * **その回の消費は Hono の応答（`neuronsUsed`）から受け取る。** D1をもう一度
 * 読み直すと、加算と読み直しの間に別の生成が挟まったときにずれる。
 *
 * **失敗でも、AI を呼んだあとなら `neuronsUsed` が載る**（不変条件11。消費は成否によらない）。
 * そのときは `error` の外に `neuronsRemaining` を足す。`error` の形は変えない。
 * AI を呼ぶ前の失敗（ロック中・語彙不足など）には足さない。
 *
 * @param neurons 呼び出す前に読んだ本日の消費
 */
export function generationResponse(
  res: { ok: boolean; status: number },
  body: object,
  neurons: number,
): Response {
  const { neuronsUsed } = body as { neuronsUsed?: number };
  if (!res.ok) {
    return Response.json(
      neuronsUsed === undefined
        ? body
        : { ...body, neuronsRemaining: remainingNeurons(neurons + neuronsUsed) },
      { status: res.status },
    );
  }
  // 既存テーマの再利用（AIを呼んでいない）は neuronsUsed が無いので、消費0として返す
  return Response.json({
    ...body,
    neuronsRemaining: remainingNeurons(neurons + (neuronsUsed ?? 0)),
  });
}
