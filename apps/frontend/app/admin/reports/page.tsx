import type { Metadata } from "next";
import { AdminReportList } from "@/components/admin/AdminReportList";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 管理: 読み違い報告の承認キュー。ガードと枠は `admin/layout.tsx` が持つ */
export default function AdminReportsPage() {
  return <AdminReportList />;
}
