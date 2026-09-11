import type { PromptForm } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";

export interface RankingEntry {
  rank: number;
  userId: string;
  /** 未設定なら null。登録にはユーザー名が要るので通常は埋まっている */
  displayName: string | null;
  score: number;
  hits: number;
  misses: number;
  elapsedMs: number;
  createdAt: number;
}

/**
 * テーマ×形式の上位100件。詳細ページ（SSR）が使う。
 * 自分の公開APIを fetch し直さず Service Bindings を直接使う（`lib/api/themes.ts` と同じ）。
 */
export async function listRankings(themeId: string, form: PromptForm): Promise<RankingEntry[]> {
  const client = await backendClient();
  const response = await client.rankings.$get({ query: { themeId, form } });
  if (!response.ok) return [];
  return ((await response.json()) as { entries: RankingEntry[] }).entries;
}
