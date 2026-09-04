/**
 * 比較対象のモデルと、そのモデル固有の設定。
 *
 * **追加は1行で済む形にしておくこと。** パイプラインの中でモデル名による条件分岐は
 * 書かない。モデルごとに違うのは「設定の値」だけで、処理の流れは共通にする。
 *
 * どれを本番に使うかは Phase 8 で品質・速度・ニューロン消費を実測して確定する。
 */

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
}

export const MODELS = {
  // 既定。速く安く品質も十分（実測 0.9〜1.6秒 / 3.7〜4.2 neurons / 採用6〜7件）
  "@cf/qwen/qwen3-30b-a3b-fp8": { promptSuffix: "/no_think" },
  // 品質は最も高いが遅く高価（実測 24〜132秒 / 96〜215 neurons）
  // 思考が長いため上限を大きく取る。8件で最大5,878トークン使った実測がある
  "@cf/zai-org/glm-4.7-flash": { maxTokens: 16_000 },
  // 速く安いが書式を崩すことがある（実測 2〜8秒 / 4〜6 neurons）
  "@cf/meta/llama-3.1-8b-instruct-fp8": {},
} as const satisfies Record<string, ModelConfig>;

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
