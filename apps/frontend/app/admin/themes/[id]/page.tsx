import type { Metadata } from "next";
import Link from "next/link";
import { AdminPromptList } from "@/components/admin/AdminPromptList";
import { Logo } from "@/components/Logo";
import { requireAdminPage } from "@/lib/api/admin-page";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * 管理: テーマのお題。確認・編集・削除の入口。
 *
 * テーマ名は一覧ページからのリンクに載せて引継ぐだけ（表示専用）。
 * ヘッダー等からリンクせず、直接URLでのみ来る。
 */
export default async function AdminThemePromptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const { name } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between border-b border-kin/40 pb-5">
        <Logo />
        <span className="text-sm tracking-[0.25em] text-kinari/50">管理 / {name ?? "お題"}</span>
      </div>
      <p className="mt-6">
        <Link
          href="/admin/themes"
          className="text-sm text-kinari/50 underline hover:text-kinari/80"
        >
          テーマ一覧へ戻る
        </Link>
      </p>
      <AdminPromptList themeId={id} />
    </main>
  );
}
