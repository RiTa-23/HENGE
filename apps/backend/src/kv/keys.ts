import { PROMPT_FORMS, type PromptForm, type ThemeKind } from "@henge/shared";

/**
 * KVのキーはここでだけ組み立てる。文字列を直書きしない。
 *
 * **テーマ削除時はKVも明示的に消すこと。** D1のCASCADEはD1の中でしか効かないため、
 * 消し忘れると「削除したテーマがキャッシュ経由で復活したように見える」不具合になる。
 */

/** テーマIDのキャッシュ・重複チェック用。TTLなし */
export function themeIdKey(kind: ThemeKind, normalizedName: string): string {
  return `theme:${kind}:${normalizedName}`;
}

/**
 * バックグラウンド生成の多重起動防止。**形式ごとに別のキーにする。**
 *
 * 1つにまとめると、単語を補充している間は短文の補充がスキップされる（逆も同じ）。
 * プールが別なら同時に作って構わない。
 */
export function themeLockKey(themeId: string, form: PromptForm): string {
  return `theme:${themeId}:${form}:lock`;
}

/** テーマ削除時に消すロックのキー。**形式ぶんすべて消す**（不変条件6） */
export function themeLockKeys(themeId: string): string[] {
  return PROMPT_FORMS.map((form) => themeLockKey(themeId, form));
}

/**
 * 生成ロックのTTL。**値は `packages/shared` に置く。**
 *
 * クライアントの待ち上限（`GENERATION_WAIT_LIMIT_MS`）より短いことが前提の値で、
 * 両Workerから見える場所に置かないと、片方だけ動かしたときに静かに壊れる。
 */
export { THEME_LOCK_TTL_SECONDS } from "@henge/shared";
