import { Logo } from "@/components/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/api/admin-page";
import { betaBadgeVisible } from "@/lib/beta/beta";

/**
 * 管理画面の共通枠。**ここで管理者判定を1回だけ行う**（`requireAdminPage`、
 * 非管理者は404）。各ページはコンテンツだけを返す。
 * セクション間の移動は `AdminNav` のタブで行う。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  // 管理画面でもサイトがベータ運用中であることは示す（運営にも見せる）
  const beta = await betaBadgeVisible();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between border-b border-kin/40 pb-5">
        <Logo beta={beta} />
        <span className="text-sm tracking-[0.25em] text-kinari/50">管理</span>
      </div>
      <AdminNav />
      <div className="pt-8">{children}</div>
    </main>
  );
}
