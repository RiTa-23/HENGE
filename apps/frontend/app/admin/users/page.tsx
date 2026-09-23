import type { Metadata } from "next";
import { AdminUserList } from "@/components/admin/AdminUserList";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 管理: ユーザー。**閲覧のみ**。更新・削除の導線を置かない */
export default function AdminUsersPage() {
  return <AdminUserList />;
}
