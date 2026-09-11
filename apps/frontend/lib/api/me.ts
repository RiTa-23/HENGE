import { remainingNeurons } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";
import type { ThemeSummary } from "@/lib/api/themes";

export interface DailyNeurons {
  /** 500 − 当日の消費。マイナスにはならない（超過分は0に張り付く） */
  remaining: number;
  /** 当日の消費ニューロン */
  used: number;
  /** 当日AIを呼んだ回数（1回あたりの重さを読む分母。上限ではない） */
  count: number;
}

/**
 * 本日のニューロン。`GET /api/me` と同じ材料（Hono の `GET /usage/:userId`）から
 * 作る。マイページはSSRなので、自分の公開APIを fetch し直さず Service Bindings を
 * 直接使う（`lib/api/themes.ts` と同じ理由）。
 *
 * 上限との比較（`remainingNeurons`）は `packages/shared` の関数で行い、
 * ここに 500 を書かない。リセット時刻は返さない。窓は 00:00 UTC で固定で、
 * 画面は「朝9時（日本時間）」と決め打ちで出す（`docs/03-data-model.md`）。
 */
export async function dailyNeurons(userId: string): Promise<DailyNeurons> {
  const client = await backendClient();
  const response = await client.usage[":userId"].$get({ param: { userId } });
  const { count, neurons } = (await response.json()) as { count: number; neurons: number };
  return { remaining: remainingNeurons(neurons), used: neurons, count };
}

/**
 * 自分が作ったテーマ／最適化する音の一覧（新しい順）。`kind` をまたいで返る。
 *
 * `userId` はセッションから取った自分のIDだけを渡す。Hono 側は渡されたIDで
 * 引くだけで「本人か」を見ないので、他人のIDを渡す口をここに作らない。
 */
export async function listMyThemes(userId: string, limit = 50): Promise<ThemeSummary[]> {
  const client = await backendClient();
  const response = await client.users.themes.$get({ query: { userId, limit: String(limit) } });
  if (!response.ok) return [];
  return ((await response.json()) as { themes: ThemeSummary[] }).themes;
}
