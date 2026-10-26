import { MIX_NAME } from "@henge/shared";
import { MixMark } from "@/components/ModeMark";
import { playHref } from "@/lib/ui/kind";

/**
 * ごちゃまぜの入口。**押したらそのままプレイへ入る**（詳細を挟まない）。
 *
 * テーマも最適化する音も選ばずに「とりあえず打ちたい」人のための入口なので、
 * 選ぶ手間を1つでも挟むと意味が無くなる。トップとお題一覧の両方に置く。
 */
export function MixCard({ className = "" }: { className?: string }) {
  return (
    <a
      href={playHref("mix", MIX_NAME)}
      className={`group flex items-center gap-6 rounded-md border border-kinari/15 bg-kinari/5 px-8 py-6 transition-colors hover:border-shu/60 ${className}`}
    >
      <MixMark className="h-12 w-12 shrink-0 text-kinari/40 transition-colors group-hover:text-kinari" />
      <span className="flex-1">
        <span className="block font-mincho text-xl tracking-wide text-kinari">
          ごちゃまぜで打つ
        </span>
        <span className="mt-2 block text-sm leading-relaxed text-kinari/60">
          テーマも音も選ばずに、すぐ始める。ランダムな言葉の組から毎回違う文章が出ます。
        </span>
      </span>
      <span className="hidden text-sm tracking-widest text-kinari/50 transition-colors group-hover:text-kinari sm:block">
        打つ →
      </span>
    </a>
  );
}
