import type { PromptForm } from "@henge/shared";
import { FormMark } from "@/components/FormMark";
import { formLabel } from "@/lib/ui/kind";

/**
 * 「生成困難」の印。**どの形式のプールが困難なのかを紋で示す。管理画面用。**
 *
 * 印は形式ごとに立つ（`generation_status` / `word_generation_status` /
 * `long_generation_status`）。文字だけの「生成困難」では、どの形式が作れないのか分からない。
 * 形式の紋（`FormMark`。「打つ」札と同じ）を並べて、どの形式の話かを見せる。
 *
 * 公開側（一覧・詳細）ではこの印を使わず、**その形式の木札を暗くして示す**
 * （`FormButton` の `difficult`）。管理画面だけ札が無いので、ここに残している。
 */
export function DifficultBadge({
  forms,
}: {
  /** 困難な形式。複数なら並べる */
  forms: PromptForm[];
}) {
  if (forms.length === 0) return null;
  const names = forms.map(formLabel).join("と");

  return (
    <span
      title={`${names}のお題の生成が難しい`}
      className="inline-flex items-center gap-0.5 rounded-full border border-kinari/20 px-1 py-px text-[10px] leading-4 whitespace-nowrap text-kinari/50"
    >
      {forms.map((form) => (
        <FormMark key={form} form={form} className="size-3.5" />
      ))}
      生成困難
    </span>
  );
}

/** テーマの形式ごとの印を、困難な形式の配列に畳む */
export function difficultForms(theme: {
  kind: "theme" | "constraint";
  generationStatus: "ok" | "difficult";
  wordGenerationStatus: "ok" | "difficult";
  longGenerationStatus: "ok" | "difficult";
}): PromptForm[] {
  const forms: PromptForm[] = [];
  if (theme.generationStatus === "difficult") forms.push("sentence");
  // 最適化練習に単語・長文は無いので、その印は見ない
  if (theme.kind === "theme" && theme.wordGenerationStatus === "difficult") forms.push("word");
  if (theme.kind === "theme" && theme.longGenerationStatus === "difficult") forms.push("long");
  return forms;
}
