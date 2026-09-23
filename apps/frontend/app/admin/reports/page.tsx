import type { Metadata } from "next";
import { AdminReportList } from "@/components/admin/AdminReportList";
import { Logo } from "@/components/Logo";
import { requireAdminPage } from "@/lib/api/admin-page";
import { betaBadgeVisible } from "@/lib/beta/beta";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 管理: 読み違い報告の承認キュー。直接URLでのみ来る */
export default async function AdminReportsPage() {
  await requireAdminPage();
  const beta = await betaBadgeVisible();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between border-b border-kin/40 pb-5">
        <Logo beta={beta} />
        <span className="text-sm tracking-[0.25em] text-kinari/50">管理 / 報告</span>
      </div>
      <AdminReportList />
    </main>
  );
}
