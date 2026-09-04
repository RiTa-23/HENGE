import { buildGenerationPrompt, parseGeneratedLines } from "./prompt";
import type { ModelId } from "./model";
import type { ThemeKind } from "@henge/shared";

/** AI Gatewayのメタデータは1リクエスト5件まで。値は文字列・数値・真偽値のみ */
export interface GenerationMetadata {
  themeId: string;
  kind: ThemeKind;
  round: number;
  path: "create" | "regenerate" | "refill";
}

export interface AiCallResult {
  texts: string[];
  /** patchLog() で検証結果を書き戻すためのログID */
  logId: string | undefined;
}

/**
 * Workers AI の呼び出し。**AI Gateway 経由にする。**
 *
 * これでレイテンシ・コスト・回数がダッシュボードに記録され、
 * Phase 8 のモデル比較用の計測コードを自前で書かずに済む。
 */
export async function requestPrompts(
  env: Env,
  input: {
    model: ModelId;
    kind: ThemeKind;
    name: string;
    count: number;
    existing: string[];
    metadata: GenerationMetadata;
  },
): Promise<AiCallResult> {
  const { system, user } = buildGenerationPrompt(input);

  // Workers AI の型はモデルごとのオーバーロードになっているため、
  // モデルIDを値（配列の要素）として持つ設計とは両立しない。
  // モデル追加を1行で済ませることを優先し、ここ1か所だけ型を緩める。
  const run = env.AI.run as (
    model: string,
    input: { messages: { role: string; content: string }[] },
    options: Record<string, unknown>,
  ) => Promise<{ response?: string }>;

  const response = await run(
    input.model,
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    {
      gateway: {
        id: "henge",
        // キャッシュが効くと同じテーマに同じお題が返り、「毎回違うお題」という前提が壊れる。
        // ダッシュボード側の設定に依存させないため、コードで明示する。
        skipCache: true,
        metadata: { ...input.metadata },
      },
    },
  );

  return {
    texts: parseGeneratedLines(response.response ?? ""),
    logId: env.AI.aiGatewayLogId ?? undefined,
  };
}

/** 検証結果をログに書き戻す。却下率はここで見る（D1に集計用テーブルを作らない） */
export async function recordGenerationResult(
  env: Env,
  logId: string,
  result: { requested: number; valid: number; rejected: Record<string, number> },
): Promise<void> {
  const rejected = Object.entries(result.rejected)
    .map(([reason, count]) => `${reason}:${count}`)
    .join(",");

  await env.AI.gateway("henge").patchLog(logId, {
    score: Math.round((result.valid / result.requested) * 100),
    metadata: { rejected },
  });
}
