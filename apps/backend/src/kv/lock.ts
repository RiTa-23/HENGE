import type { PromptForm } from "@henge/shared";
import { THEME_LOCK_TTL_SECONDS, themeLockKey, themeLockKeys } from "./keys";

/**
 * バックグラウンド生成の多重起動防止。
 *
 * KVには比較交換（compare-and-set）が無いため、取得は「読んで無ければ書く」の
 * ベストエフォート。ごく短い間に複数のリクエストが同時に来ると二重に取れる可能性は残るが、
 * 二重に生成されても余分なお題が増えるだけで壊れない。
 * 生成処理がクラッシュしてもTTLで自動的に復旧するため、古いロックの掃除は不要。
 */
export async function acquireThemeLock(
  kv: KVNamespace,
  themeId: string,
  form: PromptForm,
): Promise<boolean> {
  const key = themeLockKey(themeId, form);
  if ((await kv.get(key)) !== null) return false;
  await kv.put(key, "1", { expirationTtl: THEME_LOCK_TTL_SECONDS });
  return true;
}

export async function releaseThemeLock(
  kv: KVNamespace,
  themeId: string,
  form: PromptForm,
): Promise<void> {
  await kv.delete(themeLockKey(themeId, form));
}

/**
 * テーマ削除時に、形式ぶんのロックをまとめて落とす。
 *
 * **TTL任せにしない**（不変条件6）。削除の瞬間に補充が走っていた場合、
 * 残ったロックのせいで同名テーマの作り直しが「生成中」と誤判定されうる。
 */
export async function releaseAllThemeLocks(kv: KVNamespace, themeId: string): Promise<void> {
  await Promise.all(themeLockKeys(themeId).map((key) => kv.delete(key)));
}

/**
 * 在庫不足時に「生成中」と「本当に尽きた」を区別するために使う。
 * ロックがあれば GENERATION_IN_PROGRESS を返し、クォータを消費しない。
 */
export async function isThemeLocked(
  kv: KVNamespace,
  themeId: string,
  form: PromptForm,
): Promise<boolean> {
  return (await kv.get(themeLockKey(themeId, form))) !== null;
}
