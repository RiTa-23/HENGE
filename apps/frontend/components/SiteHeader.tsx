import { Logo } from "@/components/Logo";
import { LoginButton } from "@/components/LoginButton";

/**
 * 共通ヘッダー。**管理画面へのリンクは置かない**（直接URLでのみアクセスする）。
 */
export function SiteHeader() {
  return (
    <header className="border-b border-kin/40">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-6 text-sm tracking-widest text-kinari/70">
          <a href="/themes" className="hover:text-kinari">
            お題一覧
          </a>
          <a href="/themes/new" className="hover:text-kinari">
            お題を作る
          </a>
          <LoginButton />
        </nav>
      </div>
    </header>
  );
}
