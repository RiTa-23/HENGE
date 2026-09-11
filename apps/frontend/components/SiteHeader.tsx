import { DisplayNameGate } from "@/components/DisplayNameGate";
import { Logo } from "@/components/Logo";
import { LoginButton } from "@/components/LoginButton";
import { MobileNav } from "@/components/MobileNav";
import { NAV_LINKS } from "@/components/nav-links";
import { betaBadgeVisible } from "@/lib/beta/beta";

/**
 * 共通ヘッダー。**管理画面へのリンクは置かない**（直接URLでのみアクセスする）。
 *
 * 2つのモード（テーマ／最適化）は排他なので、両方をここから辿れるようにする。
 * ベータ運用の間はロゴの横に「ベータ版」を出す（運営にも見せる。lib/beta/beta.ts）。
 *
 * **狭い画面では横並びをやめ、メニューに畳む**（`MobileNav`）。375px幅で使える幅は
 * 327pxしかないのに、横並びのナビは419px要るため、収まりようがない。
 * `relative` はメニューを下に重ねるための基準（`MobileNav` の `top-full`）。
 *
 * ユーザー名が未設定のログインユーザーには入力のモーダル（`DisplayNameGate`）を出す。
 * ヘッダーに置くのは、ログインできる画面すべてに漏れなく効かせるため。
 */
export async function SiteHeader() {
  const beta = await betaBadgeVisible();
  return (
    <header className="relative border-b border-kin/40">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo beta={beta} />
        <nav className="hidden items-center gap-6 text-sm tracking-widest text-kinari/70 sm:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-kinari">
              {link.label}
            </a>
          ))}
          <LoginButton />
        </nav>
        <MobileNav />
      </div>
      <DisplayNameGate />
    </header>
  );
}
