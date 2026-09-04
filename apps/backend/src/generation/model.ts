/**
 * 比較対象のモデル。**追加は1行で済む形にしておくこと。**
 *
 * パイプラインの中でモデル名による条件分岐を書かない。分岐が生まれた時点で、
 * モデルを足すたびに全経路のテストが必要になる。プロンプトも全モデル共通のものを1つだけ持つ。
 *
 * どれを使うかは Phase 8 で品質・速度・ニューロン消費を実測して決める。
 */
export const MODELS = [
  // 品質は高いが遅く高価（実測 24〜132秒 / 96〜215 neurons）
  "@cf/zai-org/glm-4.7-flash",
  // 速く安いが品質は落ちる（実測 2〜8秒 / 4〜6 neurons）。書式を崩すことがある
  "@cf/meta/llama-3.1-8b-instruct-fp8",
] as const;

export type ModelId = (typeof MODELS)[number];

export const DEFAULT_MODEL: ModelId = MODELS[0];

/** 環境変数で切り替える。未指定・未知の値なら既定のモデルを使う */
export function resolveModel(value: string | undefined): ModelId {
  return MODELS.find((model) => model === value) ?? DEFAULT_MODEL;
}
