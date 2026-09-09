"use client";

import { useEffect, useId, useState } from "react";
import { LoginButton } from "@/components/LoginButton";
import { NAV_LINKS } from "@/components/nav-links";

/**
 * 狭い画面のナビ。**メニューに畳む。**
 *
 * 375px幅で使える幅は327pxしかないのに、ナビは横並びだと419px要る
 * （「Googleでログイン」だけで162px）。**項目を減らさずに収める方法が他にない。**
 *
 * 開閉の状態を持つのでクライアントコンポーネント。広い画面では `SiteHeader` 側の
 * 横並びを使うので、こちらは `sm` 未満でだけ出す。
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "メニューを閉じる" : "メニューを開く"}
        onClick={() => setOpen((value) => !value)}
        className="block rounded border border-kinari/20 p-2 text-kinari/70 transition-colors hover:border-kin hover:text-kinari"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          {open ? (
            <path
              d="M5 5L19 19M19 5L5 19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open && (
        // ヘッダーの下に重ねる。**押し下げない。**開いた瞬間に本文がずれると、
        // 直前まで見ていた位置を見失う
        <div
          id={panelId}
          className="absolute inset-x-0 top-full z-10 border-b border-kin/40 bg-sumi px-6 py-4"
        >
          <ul className="flex flex-col gap-1 text-sm tracking-widest text-kinari/70">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="block py-2 hover:text-kinari">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-kinari/10 pt-4">
            <LoginButton />
          </div>
        </div>
      )}
    </div>
  );
}
