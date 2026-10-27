import { MIX_CHAOS_NAME, MIX_STANDARD_NAME, MIX_SUPER_CHAOS_NAME } from "@henge/shared";
import { MixMark } from "@/components/ModeMark";
import { detailHref, playHref } from "@/lib/ui/kind";
import { MIX_COPY } from "@/lib/ui/mix";

/**
 * おまかせ・ごちゃまぜの入口。**押したらそのままプレイへ入る**（詳細を挟まない）。
 *
 * テーマも最適化する音も選ばずに「とりあえず打ちたい」人のための入口なので、
 * 選ぶ手間を1つでも挟むと意味が無くなる。トップとお題一覧の両方に置く。
 *
 * **標準はおまかせ（1語）。** 大きいカードで主役に置き、ごちゃまぜ（2語・カオスモード）は
 * その下に細く添える。どちらを押せばよいか迷わせない。超ごちゃまぜ（3語・超カオス）は
 * カオスの行の右端から、ごちゃまぜの詳細（3語を選んだ状態）へ辿る。
 */
export function MixCard({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <a
        href={playHref("mix", MIX_STANDARD_NAME)}
        className="group flex items-center gap-6 rounded-md border border-kinari/15 bg-kinari/5 px-8 py-6 transition-colors hover:border-shu/60"
      >
        <MixMark
          pips={1}
          className="h-12 w-12 shrink-0 text-kinari/40 transition-colors group-hover:text-kinari"
        />
        <span className="flex-1">
          <span className="block font-mincho text-xl tracking-wide text-kinari">
            {MIX_STANDARD_NAME}で打つ
          </span>
          <span className="mt-2 block text-sm leading-relaxed text-kinari/60">
            {MIX_COPY[MIX_STANDARD_NAME].tagline}
          </span>
        </span>
        <span className="hidden text-sm tracking-widest text-kinari/50 transition-colors group-hover:text-kinari sm:block">
          打つ →
        </span>
      </a>
      {/*
        カオスの行は2つのリンクを横に並べる（リンクの入れ子はできない）。行の大部分はごちゃまぜ
        （2語）へ直行、右端の「超カオス」は 3語を選んだ状態の詳細ページへ（そこで2語と選び直せる）
      */}
      <div className="flex items-stretch gap-2">
        <a
          href={playHref("mix", MIX_CHAOS_NAME)}
          className="group flex flex-1 items-center gap-4 rounded-md border border-kinari/10 px-8 py-3 transition-colors hover:border-shu/60"
        >
          <MixMark
            pips={5}
            className="h-6 w-6 shrink-0 text-kinari/30 transition-colors group-hover:text-kinari"
          />
          <span className="shrink-0 rounded-sm border border-kin/50 px-1.5 text-xs tracking-widest text-kin">
            {MIX_COPY[MIX_CHAOS_NAME].level}
          </span>
          <span className="flex-1 text-sm text-kinari/70">
            <span className="font-mincho tracking-wide text-kinari">{MIX_CHAOS_NAME}</span>
            <span className="ml-3 hidden text-kinari/50 md:inline">
              {MIX_COPY[MIX_CHAOS_NAME].tagline}
            </span>
          </span>
          <span className="text-xs tracking-widest text-kinari/40 transition-colors group-hover:text-kinari">
            →
          </span>
        </a>
        <a
          href={detailHref("mix", MIX_SUPER_CHAOS_NAME)}
          className="group flex shrink-0 items-center gap-2 rounded-md border border-kinari/10 px-4 py-3 text-xs tracking-widest text-kinari/60 transition-colors hover:border-shu/60 hover:text-kinari"
        >
          <MixMark
            pips={6}
            className="h-5 w-5 shrink-0 text-kinari/30 transition-colors group-hover:text-kinari"
          />
          {MIX_COPY[MIX_SUPER_CHAOS_NAME].level}
        </a>
      </div>
    </div>
  );
}
