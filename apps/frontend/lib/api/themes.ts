import type { ThemeKind } from "@henge/shared";
import { backendClient } from "@/lib/api/backend";

export interface ThemeDetail {
  id: string;
  kind: ThemeKind;
  name: string;
  promptCount: number;
  totalPlayCount: number;
  generationStatus: "ok" | "difficult";
  createdAt: number;
}

export interface ThemeSummary extends Omit<ThemeDetail, "promptCount"> {}

/**
 * 表示名からテーマを1件引く。サーバーコンポーネント用。
 *
 * 自分の公開APIを fetch し直さず Service Bindings を直接使う。同じ Worker の
 * 中で HTTP を1往復させる意味がない。**正規化は Hono 側で行う**ので、
 * ここで名前をいじらない（規則が2か所に分かれると必ずずれる）。
 *
 * 一覧はお題数を持たない（テーマごとに集計すると重い）ので、詳細は別に取る。
 */
export async function findTheme(kind: ThemeKind, name: string): Promise<ThemeDetail | null> {
  const client = await backendClient();
  const found = await client.themes.$get({ query: { kind, name } });
  const [summary] = ((await found.json()) as { themes: { id: string }[] }).themes;
  if (summary === undefined) return null;

  const detail = await client.themes[":id"].$get({ param: { id: summary.id } });
  if (!detail.ok) return null;
  return ((await detail.json()) as { theme: ThemeDetail }).theme;
}

/** テーマ／含む文字の一覧。SSRのページが使う */
export async function listThemes(params: {
  kind: ThemeKind;
  sort: "popular" | "recent";
  limit?: number;
}): Promise<ThemeSummary[]> {
  const client = await backendClient();
  const response = await client.themes.$get({
    query: {
      kind: params.kind,
      sort: params.sort,
      ...(params.limit === undefined ? {} : { limit: String(params.limit) }),
    },
  });
  if (!response.ok) return [];
  return ((await response.json()) as { themes: ThemeSummary[] }).themes;
}

/**
 * ページのルートパラメータをデコードする。
 *
 * **Next.js はページと Route Handler でパラメータの扱いが違う。** Route Handler は
 * デコード済みで渡ってくるが（そちらで decodeURIComponent をかけると二重デコードに
 * なる）、ページは**エンコードされたまま**渡ってくる。ここでデコードしないと
 * 日本語のテーマ名が1件も引けない。
 *
 * 手で叩かれた壊れたURL（`%` 単体など）では decodeURIComponent が投げるので、
 * その場合は null にして呼び出し側で404にする。
 */
export function decodePageParam(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
