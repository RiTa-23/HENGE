import type { Metadata } from "next";
import { AdminThemeList } from "@/components/admin/AdminThemeList";
import { Logo } from "@/components/Logo";
import { requireAdminPage } from "@/lib/api/admin-page";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 管理: テーマ。ヘッダー等からリンクせず、直接URLでのみ来る */
export default async function AdminThemesPage() {
  await requireAdminPage();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between border-b border-kin/40 pb-5">
        <Logo />
        <span className="text-sm tracking-[0.25em] text-kinari/50">管理 / テーマ</span>
      </div>
      <AdminThemeList />
    </main>
  );
}
