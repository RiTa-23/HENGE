import type { Metadata } from "next";
import { AdminThemeList } from "@/components/admin/AdminThemeList";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 管理: テーマ。ガードと枠は `admin/layout.tsx` が持つ */
export default function AdminThemesPage() {
  return <AdminThemeList />;
}
