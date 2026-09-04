import { buildGenerationPrompt, parseGeneratedLines } from "./prompt";
import { DEFAULT_MAX_TOKENS, modelConfig, type ModelId } from "./model";
import type { ThemeKind } from "@henge/shared";

/** AI Gatewayのメタデータは1リクエスト5件まで。値は文字列・数値・真偽値のみ */
export interface GenerationMetadata {
  themeId: string;
  kind: ThemeKind;
  round: number;
  path: "create" | "regenerate" | "refill";
}

/**
 * モデルによって応答の形が違う。
 * - Workers AI の従来形: `{ response: "..." }`
 * - OpenAI互換形: `{ choices: [{ message: { content: "..." } }] }`（GLM系）
 *
 * これはモデルごとの分岐ではなく応答形式の正規化なので、
 * 「モデル名で分岐しない」方針とは矛盾しない。新しいモデルを足しても
 * どちらかの形に収まる限りコードは変わらない。
 */
interface AiResponse {
  response?: string;
  choices?: { message?: { content?: string } }[];
  usage?: { neurons?: number };
}

function extractText(result: AiResponse): string {
  return result.response ?? result.choices?.[0]?.message?.content ?? "";
}

export interface AiCallResult {
  texts: string[];
  /** patchLog() で検証結果を書き戻すためのログID */
  logId: string | undefined;
  /** 応答が返す消費ニューロン（モデルによっては入っていない） */
  neurons: number | undefined;
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
    /** モデルの設定を上書きする場合のみ指定する（検証用）。通常は MODELS から引く */
    promptSuffix?: string;
  },
): Promise<AiCallResult> {
  const { system, user } = buildGenerationPrompt(input);
  // モデル固有の指示は MODELS から引く。呼び出し側がモデルの事情を知らなくて済む
  const config = modelConfig(input.model);
  const suffix = input.promptSuffix ?? config.promptSuffix;

  // Workers AI の型はモデルごとのオーバーロードになっているため、
  // モデルIDを値（配列の要素）として持つ設計とは両立しない。
  // モデル追加を1行で済ませることを優先し、ここ1か所だけ型を緩める。
  // bind を外すと env.AI の内部状態（プライベートフィールド）にアクセスできず
  // 実行時に落ちる。型を緩めるだけでレシーバを切り離さないこと。
  const run = env.AI.run.bind(env.AI) as (
    model: string,
    input: { messages: { role: string; content: string }[]; max_tokens: number },
    options: Record<string, unknown>,
  ) => Promise<AiResponse>;

  const response = await run(
    input.model,
    {
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: suffix === undefined ? user : `${user}\n${suffix}`,
        },
      ],
      // 既定は2000。推論モデルは思考だけでこれを使い切り、本文が空のまま返る
      // （qwen3-30b-a3b-fp8 で実際に発生した）。実際に使った分しか課金されないため、
      // 余裕を持たせておく。上限はモデルごとに変えられる。
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
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
    texts: parseGeneratedLines(extractText(response)),
    logId: env.AI.aiGatewayLogId ?? undefined,
    neurons: response.usage?.neurons,
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
