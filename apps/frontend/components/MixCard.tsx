import {
  MIX_CHAOS_NAME,
  MIX_STANDARD_NAME,
  MIX_SUPER_CHAOS_NAME,
  type MixName,
} from "@henge/shared";
import type { ReactNode } from "react";
import { FormMark } from "@/components/FormMark";
import { MixMark } from "@/components/ModeMark";
import { formColor, formLabel, playHref } from "@/lib/ui/kind";
import { MIX_COPY } from "@/lib/ui/mix";

/**
 * おまかせ・ごちゃまぜの入口。**押したらそのままプレイへ入る**（詳細を挟まない）。
 *
 * テーマも最適化する音も選ばずに「とりあえず打ちたい」人のための入口なので、
 * 選ぶ手間を1つでも挟むと意味が無くなる。トップとお題一覧の両方に置く。
 *
 * **標準はおまかせ（1語）。** 大きいカードで主役に置き、ごちゃまぜ（2語・カオスモード）は
 * その下に細く添える。どちらを押せばよいか迷わせない。
 *
 * **同じモードの別の形式・強さは、同じカードの下段に並べる**（おまかせの短文／単語、
 * ごちゃまぜのカオス／超カオス）。別の枠に出すと別の入口に見えるため。
 * リンクは入れ子にできないので、カードの上段（標準へ直行）と下段の各項目を兄弟のリンクにし、
 * 枠はそれらを包む `div` が持つ。下段の項目もすべてプレイへ直行する。
 */
export function MixCard({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <ModeCard
        tone="primary"
        main={
          <a
            href={playHref("mix", MIX_STANDARD_NAME)}
            className="group flex items-center gap-6 px-5 py-6 sm:px-8"
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
            <Arrow label="打つ" />
          </a>
        }
        label="形式"
        options={(["sentence", "word"] as const).map((form) => ({
          href: playHref("mix", MIX_STANDARD_NAME, form),
          mark: <FormMark form={form} className={`size-4 ${formColor(form).text}`} />,
          name: formLabel(form),
          isDefault: form === "sentence",
        }))}
      />
      <ModeCard
        tone="secondary"
        main={
          <a
            href={playHref("mix", MIX_CHAOS_NAME)}
            className="group flex items-center gap-4 px-5 py-4 sm:px-8"
          >
            <MixMark
              pips={5}
              className="h-6 w-6 shrink-0 text-kinari/30 transition-colors group-hover:text-kinari"
            />
            <span className="flex-1 text-sm text-kinari/70">
              <span className="font-mincho tracking-wide text-kinari">{MIX_CHAOS_NAME}</span>
              <span className="ml-3 hidden text-kinari/50 md:inline">
                {MIX_COPY[MIX_CHAOS_NAME].tagline}
              </span>
            </span>
            <Arrow />
          </a>
        }
        label="強さ"
        options={CHAOS_LEVELS.map(({ name, pips, words, isDefault }) => ({
          href: playHref("mix", name),
          mark: <MixMark pips={pips} className="size-4 shrink-0 text-kin" />,
          name: `${MIX_COPY[name].level} ${words}語`,
          isDefault,
        }))}
      />
    </div>
  );
}

/** ごちゃまぜの下段に並べる強さ。先頭が標準（上段と同じ行き先） */
const CHAOS_LEVELS: { name: MixName; pips: 5 | 6; words: number; isDefault: boolean }[] = [
  { name: MIX_CHAOS_NAME, pips: 5, words: 2, isDefault: true },
  { name: MIX_SUPER_CHAOS_NAME, pips: 6, words: 3, isDefault: false },
];

type Option = { href: string; mark: ReactNode; name: string; isDefault: boolean };

/**
 * 1つのモードのカード。上段が標準へ直行するリンク、下段がそのモードの中で選べる形式・強さ。
 * 下段は枠の内側に罫線で区切って置き、同じモードの中の選択肢であることを見せる。
 */
function ModeCard({
  tone,
  main,
  label,
  options,
}: {
  tone: "primary" | "secondary";
  main: ReactNode;
  label: string;
  options: Option[];
}) {
  const frame =
    tone === "primary" ? "border-kinari/15 bg-kinari/5" : "border-kinari/10 bg-transparent";
  return (
    <div
      className={`overflow-hidden rounded-md border transition-colors has-[a:hover]:border-shu/60 ${frame}`}
    >
      {main}
      <div className="flex flex-wrap items-center gap-2 border-t border-kinari/10 px-5 py-2.5 sm:px-8">
        <span className="mr-2 text-xs tracking-widest text-kinari/40">{label}</span>
        {options.map((option) => (
          <a
            key={option.href}
            href={option.href}
            className="group inline-flex items-center gap-2 rounded-sm border border-kinari/10 px-3 py-1 text-xs tracking-widest text-kinari/70 transition-colors hover:border-kinari/40 hover:text-kinari"
          >
            {option.mark}
            {option.name}
            {option.isDefault && <span className="text-kinari/40">標準</span>}
            <span className="text-kinari/30 transition-colors group-hover:text-kinari">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <span className="hidden text-sm tracking-widest text-kinari/50 transition-colors group-hover:text-kinari sm:block">
      {label ? `${label} →` : "→"}
    </span>
  );
}
