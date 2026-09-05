import type { Metadata } from "next";
import { AdminUserList } from "@/components/admin/AdminUserList";
import { Logo } from "@/components/Logo";
import { requireAdminPage } from "@/lib/api/admin-page";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 管理: ユーザー。**閲覧のみ**。更新・削除の導線を置かない */
export default async function AdminUsersPage() {
  await requireAdminPage();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between border-b border-kin/40 pb-5">
        <Logo />
        <span className="text-sm tracking-[0.25em] text-kinari/50">管理 / ユーザー</span>
      </div>
      <AdminUserList />
    </main>
  );
}
