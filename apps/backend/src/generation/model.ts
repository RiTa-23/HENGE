/**
 * 比較対象のモデルと、そのモデル固有の設定。
 *
 * **追加は1行で済む形にしておくこと。** パイプラインの中でモデル名による条件分岐は
 * 書かない。モデルごとに違うのは「設定の値」だけで、処理の流れは共通にする。
 *
 * どれを本番に使うかは Phase 8 で品質・速度・ニューロン消費を実測して確定する。
 */

/**
 * 消費ニューロンの単価。**1百万トークンあたり**（Workers AI の料金表と同じ単位）。
 * https://developers.cloudflare.com/workers-ai/platform/pricing/
 *
 * **料金が変わったらここだけ直す。** 応答からは実際のニューロン数が返らない
 * （`usage` に入っているのはトークン数だけ）ため、この表が課金台帳の根拠になる。
 */
export interface NeuronRates {
  input: number;
  output: number;
}

export interface ModelConfig {
  /**
   * 応答の上限トークン数。省略時は DEFAULT_MAX_TOKENS。
   *
   * 推論モデルは思考だけで上限を使い切り、本文が空のまま返る。
   * glm-4.7-flash は8件の生成で出力2,607〜5,878トークンを使った実測があるため、
   * 既定の4,000では本番の20件で確実に足りない。
   */
  maxTokens?: number;

  /**
   * プロンプト末尾に足す、そのモデル固有の指示。
   *
   * Qwen3系は `/no_think` で思考モードを切れる。思考も課金対象の出力トークンなので、
   * 切ると速度・コストが1桁変わる。HENGEのお題生成は探索を要する問題ではないため、
   * 思考させても品質は上がらず、むしろ思考中の連想メモに引きずられて内容が劣化する。
   */
  promptSuffix?: string;

  /**
   * トークン単価。`MODELS` に載せるモデルは**必ず持つ**（型で強制している）。
   * 省略できるのは検証用に直接IDを渡された未知のモデルだけで、その場合の
   * 消費は0として扱う（推定値で埋めない。実測でない数字を台帳に混ぜない）。
   */
  neurons?: NeuronRates;
}

/** `MODELS` に登録するモデル。単価の書き忘れをコンパイル時に落とす */
type RegisteredModel = ModelConfig & { neurons: NeuronRates };

export const MODELS = {
  // 既定。速く安く品質も十分（実測 0.9〜1.6秒 / 3.7〜4.2 neurons / 採用6〜7件）
  "@cf/qwen/qwen3-30b-a3b-fp8": {
    promptSuffix: "/no_think",
    neurons: { input: 4_625, output: 30_475 },
  },
  // 品質は最も高いが遅く高価（実測 24〜132秒 / 96〜215 neurons）
  // 思考が長いため上限を大きく取る。8件で最大5,878トークン使った実測がある
  "@cf/zai-org/glm-4.7-flash": {
    maxTokens: 16_000,
    neurons: { input: 5_500, output: 36_400 },
  },
  // 速く安いが書式を崩すことがある（実測 2〜8秒 / 4〜6 neurons）
  "@cf/meta/llama-3.1-8b-instruct-fp8": {
    neurons: { input: 13_778, output: 26_128 },
  },
} as const satisfies Record<string, RegisteredModel>;

export type ModelId = keyof typeof MODELS;

/**
 * 上限トークン数の既定。モデル側の既定（2000）だと推論モデルが本文を書く前に
 * 打ち切られるため、明示する。課金は実際に使った分だけなので余裕を取ってよい。
 */
export const DEFAULT_MAX_TOKENS = 4000;

export const DEFAULT_MODEL: ModelId = "@cf/qwen/qwen3-30b-a3b-fp8";

/** 環境変数で切り替える。未指定・未知の値なら既定のモデルを使う */
export function resolveModel(value: string | undefined): ModelId {
  return value !== undefined && value in MODELS ? (value as ModelId) : DEFAULT_MODEL;
}

/** そのモデルの設定。MODELS に無いモデル（検証用）には空の設定を返す */
export function modelConfig(model: string): ModelConfig {
  return (MODELS as Record<string, ModelConfig>)[model] ?? {};
}

/** 応答が返すトークン数。モデルによっては入っていない */
export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/**
 * この呼び出しで消費したニューロン。
 *
 * **応答にニューロン数は入っていない。** Workers AI が返すのはトークン数だけなので、
 * モデルごとの単価（`MODELS` の `neurons`）を掛けてこちらで出す。上限の判定に使う
 * 値がここで決まるため、単価の更新漏れはそのまま課金のずれになる。
 *
 * 単価かトークン数のどちらかが取れなければ0を返す。**推定値では埋めない。**
 * 消費していないのに減るより、記録漏れの方が利用者に対して害が少ない。
 */
export function neuronsUsed(model: string, usage: TokenUsage | undefined): number {
  const rates = modelConfig(model).neurons;
  if (rates === undefined || usage === undefined) return 0;
  const input = (usage.prompt_tokens ?? 0) * rates.input;
  const output = (usage.completion_tokens ?? 0) * rates.output;
  return (input + output) / 1_000_000;
}
