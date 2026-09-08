import { Logo } from "@/components/Logo";
import { LoginButton } from "@/components/LoginButton";
import { betaBadgeVisible } from "@/lib/beta/beta";

/**
 * 共通ヘッダー。**管理画面へのリンクは置かない**（直接URLでのみアクセスする）。
 *
 * 2つのモード（テーマ／最適化）は排他なので、両方をここから辿れるようにする。
 * ベータ運用の間はロゴの横に「ベータ版」を出す（運営にも見せる。lib/beta/beta.ts）。
 */
export async function SiteHeader() {
  const beta = await betaBadgeVisible();
  return (
    <header className="border-b border-kin/40">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo beta={beta} />
        <nav className="flex items-center gap-6 text-sm tracking-widest text-kinari/70">
          <a href="/themes" className="hover:text-kinari">
            お題一覧
          </a>
          <a href="/practice" className="hover:text-kinari">
            最適化
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
