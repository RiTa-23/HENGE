import { redirect } from "next/navigation";

/**
 * `/admin` の入口は報告キューへ流す。管理画面の正史は `/admin/reports`。
 * レイアウトが先に `requireAdminPage` を通すので、非管理者はここに来る前に404。
 */
export default function AdminIndexPage() {
  redirect("/admin/reports");
}
