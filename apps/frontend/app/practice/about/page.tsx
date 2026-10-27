import type { Metadata } from "next";
import { FingeringDemo } from "@/components/about/FingeringDemo";
import {
  PracticeFlowFigure,
  RepetitionFigure,
  RomanBranchFigure,
  SameFingerTimelineFigure,
  StandardFingeringFigure,
} from "@/components/about/figures";
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
 * **文字だけで説明しない。** 各節に図を1つ置く（`components/about/`）。図はプレイ画面と
 * 同じ部品・同じ塗り（押すキーと指は橙）で描き、説明で見たものがプレイ中にも同じ意味で光るようにする。
 *
 * 例の指は `lib/play/fingers.ts` の標準運指と食い違わないこと（動く図は標準の指をそこから引く）。
 */

/** 見出しと本文の組（app/privacy/page.tsx と同じ形） */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
      <h2 className="font-mincho text-xl tracking-wide text-kinari">{title}</h2>
      <div className="mt-4 space-y-5 leading-loose text-kinari/70">{children}</div>
    </section>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <strong className="font-normal text-kinari">{children}</strong>;
}

export default function OptimizationAboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <p className="text-sm tracking-[0.25em] text-kinari/50">最適化練習の手引き</p>
        <h1 className="mt-3 font-mincho text-3xl tracking-wide text-kinari">最適化とは？</h1>
        <p className="mt-6 leading-loose text-kinari/70">
          教科書どおりの指の使い方（標準運指）をあえて崩して、
          <Em>同じ指が続く並びを、別々の指で打てるよう組み替える</Em>
          こと。ある程度速く打てる人が、もう一段速くなるための技術です。
        </p>

        <Section title="1. まず、標準運指">
          <p>
            タッチタイピングでは、<Em>縦の列ごとに押す指</Em>が決まっています。これが標準運指です。
          </p>
          <StandardFingeringFigure />
        </Section>

        <Section title="2. 同じ指が続くと、遅くなる">
          <p>
            「き」は K → I。<Em>どちらも右の中指</Em>
            なので、押してから指を動かし、もう一度押すしかありません。
          </p>
          <SameFingerTimelineFigure />
          <p>1打ごとの差はわずかでも、よく出る音で何度も起きると、文章全体の速さに響きます。</p>
        </Section>

        <Section title="3. 指を組み替える">
          <p>
            片方のキーを<Em>隣の指に任せる</Em>
            。これが最適化です。音を選ぶと、標準運指と最適化で打ち比べます。
          </p>
          <FingeringDemo />
          <p>
            ほかにも「ゆ」（<span className="font-mono">yu</span>）や「ぬ」（
            <span className="font-mono">nu</span>
            ）は、どちらのキーも右の人差し指。同じ指が続く並びはたくさんあります。
          </p>
        </Section>

        <Section title="4. 打ち方を選ぶのも、最適化のうち">
          <p>どの打ち方を使うか決めてから、その指を決めます。</p>
          <RomanBranchFigure />
        </Section>

        <Section title="5. 身につけるには、反復がいる">
          <p>
            知っただけでは使えません。慣れた指は、気を抜くと元の運びに戻ります。ただ、決まった文を繰り返すだけでは、指より先に文を覚えてしまいます。
          </p>
          <p>
            HENGEのお題は、<Em>運営が1文も書いていません。</Em>
            AIがその場で作るので毎回違い、同じ文が続けて出ることもありません。
            <Em>いろいろな文の中で、何度も打てます。</Em>
          </p>
          <RepetitionFigure />
        </Section>

        <Section title="はじめる前に">
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              [
                "標準運指が身についてから",
                "手元を見ずに打てないうちは、崩す前の形を固める方が速くなります",
              ],
              ["はじめは遅くなる", "慣れた運びを変えるので、一時的に速さも正確さも落ちます"],
              ["正解は1つではない", "手の大きさや癖で、打ちやすい崩し方は人によって違います"],
              ["一度に1つずつ", "いくつもの音をまとめて変えると、どれも定着しません"],
            ].map(([title, body]) => (
              <li key={title} className="rounded border border-kinari/15 px-4 py-3">
                <p className="text-kinari">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-kinari/60">{body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="HENGEでの練習の仕方">
          <PracticeFlowFigure />
          <ul className="grid gap-3">
            {[
              [
                "練習したい最適化を、自分で作れる",
                "これまでは運営が用意した最適化しか練習できませんでした。HENGEでは、無ければログインして音を入れるだけで新しく作れます。用意を待たずに、いつでも好きな最適化を練習できます",
              ],
              ["運指を共有できる", "自分の崩し方を投稿して、ほかの人に使ってもらえます"],
              [
                "みんなの運指から選べる",
                "選んだ人の多い順に並ぶので、みんなが使っている運指を確かめて、そのまま自分の運指に設定できます",
              ],
            ].map(([title, body]) => (
              <li key={title} className="rounded border border-kinari/15 px-4 py-3">
                <p className="text-kinari">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-kinari/60">{body}</p>
              </li>
            ))}
          </ul>
          <p>打っている間、その音の箇所では選んだ運指で指を案内します。</p>
          <p className="pt-2 text-center">
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
