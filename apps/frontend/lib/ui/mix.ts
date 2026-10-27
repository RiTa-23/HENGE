import {
  MIX_CHAOS_NAME,
  MIX_MODES,
  MIX_STANDARD_NAME,
  MIX_SUPER_CHAOS_NAME,
  type MixName,
  mixWordsPerSentence,
} from "@henge/shared";

/**
 * おまかせ・ごちゃまぜ・超ごちゃまぜの画面の文言。**入口のカードと詳細ページで同じものを使う。**
 * 名前と1文の語数は `packages/shared` の `MIX_MODES` が持つ。ここは見せ方だけ。
 *
 * - `level`: 詳細ページの切り替えと肩書きに出す呼び名
 */
export const MIX_COPY: Record<MixName, { level: string; tagline: string; description: string }> = {
  [MIX_STANDARD_NAME]: {
    level: "おまかせ",
    tagline: "テーマも音も選ばずに、すぐ始める。毎回違う文章が出ます。",
    description:
      "テーマを選ばずに打てるお題です。よく使われる言葉からランダムに1語を選び、その語を使った自然な文章を作ります。",
  },
  [MIX_CHAOS_NAME]: {
    level: "カオス",
    tagline: "ランダムな2語を1文にまとめた、カオスな文章を打つ。",
    description:
      "よく使われる言葉からランダムに2語を選び、両方を使った文章を作ります。関係の薄い2語が組になることもあるので、ときどき妙な文章になります。",
  },
  [MIX_SUPER_CHAOS_NAME]: {
    level: "超カオス",
    tagline: "3語を1文に詰め込んだ、もっとカオスな文章を打つ。",
    description:
      "よく使われる言葉からランダムに3語を選び、3語すべてを1つの文に詰め込みます。関係の薄い語どうしでも3語すべてを入れるので、だいたい妙な文章になります。",
  },
};

/**
 * どの詳細ページで扱うか。**超ごちゃまぜは独自のページを持たず、ごちゃまぜの詳細で選ぶ**
 * （`/mix/ごちゃまぜ?mode=超ごちゃまぜ`）。プール・ランキングは別の行のまま、入口だけまとめる。
 */
const PAGE_OF: Record<MixName, MixName> = {
  [MIX_STANDARD_NAME]: MIX_STANDARD_NAME,
  [MIX_CHAOS_NAME]: MIX_CHAOS_NAME,
  [MIX_SUPER_CHAOS_NAME]: MIX_CHAOS_NAME,
};

/** 名前を `MixName` に揃える（NFC）。おまかせ・ごちゃまぜの名前でなければ null */
export function parseMixName(value: string | undefined): MixName | null {
  if (value === undefined) return null;
  const normalized = value.normalize("NFC");
  return mixWordsPerSentence(normalized) === null ? null : (normalized as MixName);
}

/** そのモードを扱う詳細ページの名前（`/mix/[name]` の `name`） */
export function mixPageOf(name: MixName): MixName {
  return PAGE_OF[name];
}

/** その詳細ページで選べるモード（`MIX_MODES` の順） */
export function mixModesOnPage(page: MixName): MixName[] {
  return MIX_MODES.map((mode) => mode.name).filter((name) => PAGE_OF[name] === page);
}

/**
 * 詳細ページのパス。ページの主のモードは `/mix/[name]`、ほかのモードは `?mode=` で選んだ状態にする。
 * 知らない名前はそのまま `/mix/[name]`（ページ側で404になる）。
 */
export function mixDetailPath(name: string): string {
  const mixName = parseMixName(name);
  if (mixName === null) return `/mix/${encodeURIComponent(name)}`;
  const page = mixPageOf(mixName);
  const base = `/mix/${encodeURIComponent(page)}`;
  return page === mixName ? base : `${base}?mode=${encodeURIComponent(mixName)}`;
}
