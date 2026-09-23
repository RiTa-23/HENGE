import type { Metadata } from "next";
import Link from "next/link";
import { AdminPromptList } from "@/components/admin/AdminPromptList";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * 管理: テーマのお題。確認・編集・削除の入口。
 * ガードと枠は `admin/layout.tsx` が持つ。
 */
export default async function AdminThemePromptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { id } = await params;
  // 一覧ページからのリンクに載せて引継ぐだけ（表示専用）
  const { name } = await searchParams;

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-mincho text-xl tracking-widest text-kinari">{name ?? "お題"}</h1>
        <Link
          href="/admin/themes"
          className="text-sm text-kinari/50 underline hover:text-kinari/80"
        >
          テーマ一覧へ戻る
        </Link>
      </div>
      <div className="mt-4">
        <AdminPromptList themeId={id} />
      </div>
    </>
  );
}
