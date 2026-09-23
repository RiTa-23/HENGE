"use client";

import { usePathname } from "next/navigation";

/**
 * 管理画面のセクション切り替えタブ。**画面間の移動をここ1か所に持つ。**
 * 現在のセクションは `aria-current="page"` と色で示す。
 */
const ADMIN_TABS = [
  { href: "/admin/reports", label: "報告" },
  { href: "/admin/themes", label: "テーマ" },
  { href: "/admin/users", label: "ユーザー" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex items-center gap-2 border-b border-kinari/15 pb-px">
      {ADMIN_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <a
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm tracking-widest transition-colors ${
              active
                ? "border-kin text-kinari"
                : "border-transparent text-kinari/50 hover:border-kinari/30 hover:text-kinari"
            }`}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
