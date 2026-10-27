import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ogFields, pageTitle } from "@/lib/og";

const TITLE = pageTitle("最適化とは？");
const DESCRIPTION =
  "タイピングの「最適化」を、はじめて聞く人向けに説明します。標準運指で同じ指が続く並びを、別々の指で打てるよう組み替える上級者向けの技術です。";

/** `SiteHeader` を置くので静的生成しない（app/privacy/page.tsx の説明を参照） */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...ogFields(TITLE, DESCRIPTION),
};

/**
 * 「最適化とは？」の説明ページ。**最適化という言葉を知らない人**に向けて書く。
 *
 * 最適化練習（`/practice`）は上級者向けの機能で、概念を知らないと何を練習する場所か
 * 分からない。標準運指 → 同じ指が続くと遅い → 指を組み替える、の順で積み上げる。
 *
 * **文言を「苦手」「詰まる」の側に寄せない**（lib/practice/presets.ts と同じ理由）。
 * 最適化は苦手の克服ではなく、標準運指を崩して速くする技術。
 *
 * 例の指は `lib/play/fingers.ts` の標準運指と食い違わないこと。
 */

/** 見出しと本文の組（app/privacy/page.tsx と同じ形） */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="font-mincho text-xl tracking-wide text-kinari">{title}</h2>
      <div className="mt-4 space-y-4 leading-loose text-kinari/70">{children}</div>
    </section>
  );
}

interface Stroke {
  key: string;
  /** 押す指（「右 中指」） */
  finger: string;
  /** 標準運指から変えた指か。変えた指だけ橙にする（運指の投稿一覧と同じ見せ方） */
  changed?: boolean;
}

/** キーと指を1打ずつ並べる。同じ指が続くかどうかを見比べるための図 */
function Strokes({ label, strokes }: { label: string; strokes: Stroke[] }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-10 shrink-0 text-xs tracking-widest text-kinari/50">{label}</span>
      <ol className="flex flex-wrap items-center gap-2">
        {strokes.map((stroke, index) => (
          <li key={index} className="flex items-center gap-2">
            {index > 0 && <span className="text-kinari/30">→</span>}
            <span className="flex items-center gap-2 rounded border border-kinari/20 px-3 py-1.5">
              <span className="font-mono text-lg text-kinari">{stroke.key}</span>
              <span className={`text-sm ${stroke.changed ? "text-daidai" : "text-kinari/60"}`}>
                {stroke.finger}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface Example {
  kana: string;
  roman: string;
  standard: Stroke[];
  optimized: Stroke[];
  note: string;
}

const EXAMPLES: Example[] = [
  {
    kana: "き",
    roman: "ki",
    standard: [
      { key: "K", finger: "右 中指" },
      { key: "I", finger: "右 中指" },
    ],
    optimized: [
      { key: "K", finger: "右 人差し指", changed: true },
      { key: "I", finger: "右 中指" },
    ],
    note: "K と I は同じ列で、どちらも右の中指の受け持ちです。K を人差し指で押せば、I を打つ中指はもう上で待っていられます。",
  },
  {
    kana: "で",
    roman: "de",
    standard: [
      { key: "D", finger: "左 中指" },
      { key: "E", finger: "左 中指" },
    ],
    optimized: [
      { key: "D", finger: "左 人差し指", changed: true },
      { key: "E", finger: "左 中指" },
    ],
    note: "「き」の左手版です。「です」「でき」など、日本語では非常によく出てきます。",
  },
  {
    kana: "ざ",
    roman: "za",
    standard: [
      { key: "Z", finger: "左 小指" },
      { key: "A", finger: "左 小指" },
    ],
    optimized: [
      { key: "Z", finger: "左 薬指", changed: true },
      { key: "A", finger: "左 小指" },
    ],
    note: "いちばん力の弱い小指が2回続く並びです。Z を薬指に渡すと、小指は A を押すだけで済みます。",
  },
];

export default function OptimizationAboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <p className="text-sm tracking-[0.25em] text-kinari/50">最適化練習の手引き</p>
        <h1 className="mt-3 font-mincho text-3xl tracking-wide text-kinari">最適化とは？</h1>
        <p className="mt-6 leading-loose text-kinari/70">
          タイピングの<strong className="font-normal text-kinari">最適化</strong>とは、
          教科書どおりの指の使い方（標準運指）をあえて崩して、
          <strong className="font-normal text-kinari">
            同じ指が続く並びを、別々の指で打てるよう組み替える
          </strong>
          ことです。ある程度速く打てるようになった人が、もう一段速くなるための技術です。
        </p>

        <Section title="まず、標準運指">
          <p>
            タッチタイピングでは、両手の人差し指を F と J に置き（ホームポジション）、 キーボードの
            <strong className="font-normal text-kinari">縦の列ごとに押す指</strong>
            が決まっています。たとえば E・D・C の列は左の中指、I・K の列は右の中指です。 これを
            <strong className="font-normal text-kinari">標準運指</strong>と呼びます。
          </p>
          <p>
            標準運指は、どのキーにもすぐ指が届く、よくできた決まりです。
            はじめて覚えるなら、まずはこれを身につけるのが近道です。
          </p>
        </Section>

        <Section title="同じ指が続くと、遅くなる">
          <p>
            ところが、ローマ字入力では
            <strong className="font-normal text-kinari">同じ列のキーが続く</strong>
            ことがあります。「き」は K → I、どちらも右の中指です。
          </p>
          <p>
            違う指どうしなら、1打目を押している間に次の指が動き始められます。
            ところが同じ指が続くと、1打目を押し終えてから、
            <strong className="font-normal text-kinari">
              その指を次のキーまで動かして、もう一度押す
            </strong>
            しかありません。1打ごとの差はわずかでも、よく出る音で何度も起きると、
            文章全体の速さに響きます。
          </p>
        </Section>

        <Section title="指を組み替える">
          <p>
            そこで、片方のキーを
            <strong className="font-normal text-kinari">隣の指に任せます</strong>。
            これが最適化です。下の図の<span className="text-daidai">橙の指</span>
            が、標準運指から変えたところです。
          </p>
          <div className="space-y-6 pt-2">
            {EXAMPLES.map((example) => (
              <figure key={example.kana} className="rounded border border-kin/40 px-5 py-5">
                <figcaption className="flex items-baseline gap-3">
                  <span className="font-mincho text-2xl text-kinari">{example.kana}</span>
                  <span className="font-mono text-kinari/60">{example.roman}</span>
                </figcaption>
                <div className="mt-4 space-y-3">
                  <Strokes label="標準" strokes={example.standard} />
                  <Strokes label="最適化" strokes={example.optimized} />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-kinari/60">{example.note}</p>
              </figure>
            ))}
          </div>
          <p>
            ほかにも「ゆ」（<span className="font-mono">yu</span>。Y・U とも右の人差し指）や
            「ぬ」（<span className="font-mono">nu</span>。N・U とも右の人差し指）のように、
            同じ指が続く並びはたくさんあります。
          </p>
        </Section>

        <Section title="打ち方を選ぶのも、最適化のうち">
          <p>
            ローマ字入力では、1つの音にいくつもの打ち方があります。「し」は
            <span className="font-mono"> si </span>でも<span className="font-mono"> shi </span>
            でも打てますし、「ち」は<span className="font-mono"> ti </span>でも
            <span className="font-mono"> chi </span>でも打てます。
          </p>
          <p>
            打鍵数が少ない方、前後のキーと指がぶつからない方を選ぶのも、
            広い意味での最適化です。どの打ち方を使うか決めてから、その指を決めます。
          </p>
        </Section>

        <Section title="身につけるには、反復がいる">
          <p>
            最適化は、知っただけでは使えません。何年も標準運指で打ってきた指は、
            気を抜くと元の運びに戻ります。
            <strong className="font-normal text-kinari">
              新しい指の運びが無意識に出るまで、その並びを何度も打つ
            </strong>
            必要があります。
          </p>
          <p>
            このとき、同じ文章ばかり打っていると、その文章の流れごと覚えてしまい、
            別の文章に出てきたときには元の指に戻りがちです。
            <strong className="font-normal text-kinari">いろいろな文脈の中で打つ</strong>
            ことが、実戦で出せるようになる近道です。
          </p>
        </Section>

        <Section title="はじめる前に">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <b className="font-normal text-kinari">標準運指が身についてから。</b>
              手元を見ずに打てないうちは、崩す前の形を固める方が速くなります
            </li>
            <li>
              <b className="font-normal text-kinari">はじめは遅くなります。</b>
              慣れた指の運びを変えるので、一時的に速さも正確さも落ちます。
              新しい運びが定着すれば、元より速くなります
            </li>
            <li>
              <b className="font-normal text-kinari">正解は1つではありません。</b>
              手の大きさや癖で、打ちやすい崩し方は人によって違います。
              いくつか試して、自分の指に合うものを選んでください
            </li>
            <li>
              <b className="font-normal text-kinari">一度に1つずつ。</b>
              いくつもの音をまとめて変えると、どれも定着しません
            </li>
          </ul>
        </Section>

        <Section title="HENGEでの練習の仕方">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <b className="font-normal text-kinari">最適化する音を選ぶ。</b>
              「き」「で」「ざ」のような代表的なものが用意してあります。ひらがな1〜4文字で自分で指定することもできます
            </li>
            <li>
              <b className="font-normal text-kinari">運指を決める。</b>
              その音をどの打ち方で、どの指で打つかを、手の図から選びます。
              ほかの人が投稿した運指から選ぶこともできます
            </li>
            <li>
              <b className="font-normal text-kinari">打つ。</b>
              出てくるのは、その音を必ず含む文章だけで、毎回違う文章が生まれます。
              その音の箇所では、画面の運指ガイドが決めた指を案内します
            </li>
          </ol>
          <p className="pt-4">
            <a
              href="/practice"
              className="inline-block border-b border-kin/60 pb-0.5 text-kinari hover:border-kinari"
            >
              最適化練習をはじめる →
            </a>
          </p>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
