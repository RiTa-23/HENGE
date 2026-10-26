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

/**
 * 文字を入力する要素。ここにフォーカスがあるときのキーは、その欄への入力として奪わない。
 * プレイ画面の窓で拾うキー（開始前の Space・結果の R）が使う
 */
export const TEXT_ENTRY_SELECTOR = "input, textarea, select, [contenteditable=true]";

/**
 * プレイ画面の開始前に、窓で拾う Space を「開始」として扱ってよいか。
 *
 * **ボタンにフォーカスがあっても開始にする**（`isStartSpace` と違う）。開始前の画面には
 * 効果音などのスイッチが並び、押した後もフォーカスが残る。そこで Space を奪わないと、
 * 「スイッチを切り替えてから Space で開始」がスイッチの切り替えになってしまう。
 *
 * 奪わないのは**文字の入力中だけ**。運指の投稿の説明文（`FingeringPosts`）がこの画面にあり、
 * スペースや日本語入力の変換（Space）で始まると、入力が消えて説明文が書けない。
 */
export function isPlayStartSpace(event: {
  key: string;
  code: string;
  /** 日本語入力の変換中か（`KeyboardEvent.isComposing`） */
  isComposing: boolean;
  /** フォーカスが文字を入力する要素（`TEXT_ENTRY_SELECTOR`）にあるか */
  targetIsTextEntry: boolean;
}): boolean {
  // key と code の両方を見る。配列やIMEの状態によって key が空になることがある
  if (event.key !== " " && event.code !== "Space") return false;
  if (event.isComposing) return false;
  return !event.targetIsTextEntry;
}
