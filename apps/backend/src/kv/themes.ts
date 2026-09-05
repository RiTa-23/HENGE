import type { ThemeKind } from "@henge/shared";
import { themeIdKey } from "./keys";

/**
 * テーマIDのキャッシュ。重複チェックのたびにD1を引かずに済ませる。
 *
 * **テーマを削除するときはここも明示的に消すこと。** D1のCASCADEはD1の中でしか効かない。
 * 消し忘れると「削除したテーマがキャッシュ経由で復活したように見える」不具合になる。
 */
export async function getCachedThemeId(
  kv: KVNamespace,
  kind: ThemeKind,
  normalizedName: string,
): Promise<string | null> {
  return kv.get(themeIdKey(kind, normalizedName));
}

export async function cacheThemeId(
  kv: KVNamespace,
  kind: ThemeKind,
  normalizedName: string,
  themeId: string,
): Promise<void> {
  await kv.put(themeIdKey(kind, normalizedName), themeId);
}

export async function deleteCachedThemeId(
  kv: KVNamespace,
  kind: ThemeKind,
  normalizedName: string,
): Promise<void> {
  await kv.delete(themeIdKey(kind, normalizedName));
}
