import { backendClient, relay } from "@/lib/api/backend";
import { errorResponse } from "@/lib/api/error";

export const dynamic = "force-dynamic";

/** テーマ詳細。検索エンジンからの着地ページが使う。認証不要 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; name: string }> },
) {
  const { kind, name } = await params;
  if (kind !== "theme" && kind !== "constraint") return errorResponse("VALIDATION_ERROR");

  const client = await backendClient();
  // 表示名の正規化はHono側で行う。規則を2か所に分けない
  const found = await client.themes.$get({ query: { kind, name: decodeURIComponent(name) } });
  const [summary] = ((await found.json()) as { themes: { id: string }[] }).themes;
  if (summary === undefined) return errorResponse("VALIDATION_ERROR", "テーマが見つかりません");

  // 一覧はお題数を持たない（テーマごとに集計すると重い）。詳細は別に取る
  return relay(await client.themes[":id"].$get({ param: { id: summary.id } }));
}
