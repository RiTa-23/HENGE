import type { Metadata } from "next";
import { AdminPromptReportList } from "@/components/admin/AdminPromptReportList";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 管理: おかしなお題の報告キュー。ガードと枠は `admin/layout.tsx` が持つ */
export default function AdminPromptReportsPage() {
  return <AdminPromptReportList />;
}
