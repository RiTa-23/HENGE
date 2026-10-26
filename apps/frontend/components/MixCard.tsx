import { MIX_CHAOS_NAME, MIX_STANDARD_NAME } from "@henge/shared";
import { MixMark } from "@/components/ModeMark";
import { playHref } from "@/lib/ui/kind";
import { MIX_COPY } from "@/lib/ui/mix";

/**
 * おまかせ・ごちゃまぜの入口。**押したらそのままプレイへ入る**（詳細を挟まない）。
 *
 * テーマも最適化する音も選ばずに「とりあえず打ちたい」人のための入口なので、
 * 選ぶ手間を1つでも挟むと意味が無くなる。トップとお題一覧の両方に置く。
 *
 * **標準はおまかせ（1語）。** 大きいカードで主役に置き、ごちゃまぜ（2語・カオスモード）は
 * その下に細く添える。どちらを押せばよいか迷わせない。
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
      <a
        href={playHref("mix", MIX_CHAOS_NAME)}
        className="group flex items-center gap-4 rounded-md border border-kinari/10 px-8 py-3 transition-colors hover:border-shu/60"
      >
        <MixMark
          pips={5}
          className="h-6 w-6 shrink-0 text-kinari/30 transition-colors group-hover:text-kinari"
        />
        <span className="shrink-0 rounded-sm border border-kin/50 px-1.5 text-xs tracking-widest text-kin">
          カオス
        </span>
        <span className="flex-1 text-sm text-kinari/70">
          <span className="font-mincho tracking-wide text-kinari">{MIX_CHAOS_NAME}</span>
          <span className="ml-3 hidden text-kinari/50 sm:inline">
            {MIX_COPY[MIX_CHAOS_NAME].tagline}
          </span>
        </span>
        <span className="text-xs tracking-widest text-kinari/40 transition-colors group-hover:text-kinari">
          →
        </span>
      </a>
    </div>
  );
}
