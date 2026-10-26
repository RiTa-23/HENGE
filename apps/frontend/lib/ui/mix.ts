import { MIX_CHAOS_NAME, MIX_STANDARD_NAME, type MixName } from "@henge/shared";

/**
 * おまかせ・ごちゃまぜの画面の文言。**入口のカードと詳細ページで同じものを使う。**
 * 名前と1文の語数は `packages/shared` の `MIX_MODES` が持つ。ここは見せ方だけ。
 */
export const MIX_COPY: Record<MixName, { tagline: string; description: string }> = {
  [MIX_STANDARD_NAME]: {
    tagline: "テーマも音も選ばずに、すぐ始める。毎回違う文章が出ます。",
    description:
      "テーマを選ばずに打てるお題です。よく使われる言葉からランダムに1語を選び、その語を使った自然な文章を作ります。",
  },
  [MIX_CHAOS_NAME]: {
    tagline: "つながらない2語を無理やりつなげた、カオスな文章を打つ。",
    description:
      "よく使われる言葉からランダムに2語を選び、両方を使った文章を作ります。つながらない2語を無理につなげるので、ときどき妙な文章になります。",
  },
};
