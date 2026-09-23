/**
 * ヘッダーのナビ項目。**1か所で持つ。**
 *
 * 広い画面では横並び（`SiteHeader`）、狭い画面ではメニューの中（`MobileNav`）と
 * 2か所に出るため、書き写すと片方だけ増えたり消えたりする。
 *
 * **管理画面はここには置かない**（誰にでも見せる固定の並び）。
 * 「管理」導線は管理者だけが見えればよいので `AdminLink` が別に持つ。
 */
export const NAV_LINKS = [
  { href: "/themes", label: "お題一覧" },
  { href: "/practice", label: "最適化" },
  { href: "/themes/new", label: "お題を作る" },
] as const;
