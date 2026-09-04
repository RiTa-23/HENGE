import type { ThemeKind } from "@henge/shared";

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

/** バックグラウンド生成の多重起動防止 */
export function themeLockKey(themeId: string): string {
  return `theme:${themeId}:lock`;
}

/**
 * 生成ロックのTTL（秒）。
 *
 * KVの下限が60秒。生成は最大2ラウンド（AI呼び出し2回＋読み取得40回）走るため、
 * 下限ぎりぎりだと処理中にロックが切れて二重に起動しうる。余裕を見て120秒にする。
 * 処理がクラッシュしてもTTLで自動的に復旧するため、古いロックを掃除する仕組みは要らない。
 */
export const THEME_LOCK_TTL_SECONDS = 120;
