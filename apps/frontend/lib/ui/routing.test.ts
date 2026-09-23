import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 画面のルーティングとインデックス対象の振り分け（docs/07-ui.md）。
 *
 * **noindex の付け忘れは気付けない。** 付け忘れても画面は正常に動き、
 * 検索エンジンに拾われて初めて分かる。ここで機械的に固定する。
 *
 */

const APP = join(import.meta.dir, "../../app");

/** docs/07-ui.md の画面一覧。noindex の要否だけをここで持つ */
const PAGES: { route: string; file: string; noindex: boolean }[] = [
  { route: "/", file: "page.tsx", noindex: false },
  { route: "/themes", file: "themes/page.tsx", noindex: false },
  { route: "/themes/[name]", file: "themes/[name]/page.tsx", noindex: false },
  { route: "/practice", file: "practice/page.tsx", noindex: false },
  { route: "/practice/[char]", file: "practice/[char]/page.tsx", noindex: false },
  { route: "/play/[theme]", file: "play/[theme]/page.tsx", noindex: true },
  { route: "/themes/new", file: "themes/new/page.tsx", noindex: true },
  { route: "/admin", file: "admin/page.tsx", noindex: true },
  { route: "/admin/reports", file: "admin/reports/page.tsx", noindex: true },
  { route: "/admin/themes", file: "admin/themes/page.tsx", noindex: true },
  { route: "/admin/themes/[id]", file: "admin/themes/[id]/page.tsx", noindex: true },
  { route: "/admin/users", file: "admin/users/page.tsx", noindex: true },
];

describe("画面のルーティング", () => {
  it.each(PAGES)("$route のページがある", ({ file }) => {
    expect(existsSync(join(APP, file))).toBe(true);
  });

  it.each(PAGES.filter((page) => page.noindex))("$route は noindex", ({ file }) => {
    expect(readFileSync(join(APP, file), "utf8")).toContain("robots: { index: false");
  });

  it.each(PAGES.filter((page) => !page.noindex))("$route は noindex にしない", ({ file }) => {
    expect(readFileSync(join(APP, file), "utf8")).not.toContain("index: false");
  });
});

describe("管理画面への導線", () => {
  // 「管理」リンクは管理者だけに見せる。ヘッダーへ /admin へのリンクを
  // 直書きすると全員に見えるので、必ず AdminLink（/api/admin/check の
  // サーバー判定を経て管理者だけが描く）経由に限る
  const navComponents = ["SiteHeader.tsx", "MobileNav.tsx"];

  it.each(navComponents)("%s は AdminLink 経由でのみ /admin へリンクする", (name) => {
    const source = readFileSync(join(import.meta.dir, "../../components", name), "utf8");

    expect(source).toContain("AdminLink");
    expect(source).not.toMatch(/href=["'`]\/admin/);
  });

  it("AdminLink は /api/admin/check のサーバー判定を経る", () => {
    const source = readFileSync(join(import.meta.dir, "../../components/AdminLink.tsx"), "utf8");

    expect(source).toContain("/api/admin/check");
    expect(source).toContain('href="/admin"');
  });
});
