/**
 * 窓で拾う Space を「開始」として扱ってよいか。**詳細ページの朱印（`SealButton`）が使う。**
 *
 * 詳細ページにはリンクや運指の設定（ボタン・入力）が並ぶ。そこにフォーカスがあるときの
 * Space はその要素の操作なので奪わない。押しっぱなしの連続（`repeat`）と、修飾キーとの
 * 同時押しも拾わない。
 */
export function isStartSpace(event: {
  key: string;
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** フォーカスが入力欄・ボタン・リンクなど、Space を自分で使う要素にあるか */
  targetIsInteractive: boolean;
}): boolean {
  // key と code の両方を見る。配列やIMEの状態によって key が空になることがある
  if (event.key !== " " && event.code !== "Space") return false;
  if (event.repeat) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  return !event.targetIsInteractive;
}

/** Space を自分で使う要素。ここにフォーカスがあるときは `isStartSpace` が拾わない */
export const SPACE_OWNER_SELECTOR =
  "a, button, input, textarea, select, summary, [contenteditable=true], [role=button], [role=radio], [role=checkbox], [role=switch], [role=tab]";
