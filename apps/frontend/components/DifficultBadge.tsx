import type { PromptForm } from "@henge/shared";
import { SentenceMark, WordMark } from "@/components/FormMark";

/**
 * 「生成困難」の印。**どの形式のプールが困難なのかを紋で示す。**
 *
 * 印は形式ごとに立つ（`generation_status` / `word_generation_status`）。文字だけの
 * 「生成困難」では、短文が作れないのか単語が作れないのか分からない。形式の紋
 * （`FormMark`。「打つ」札と同じ）を並べて、どちらの話かを見せる。
 *
 * 一覧・詳細・管理画面で同じ部品を使う。場所ごとに違う描き方をすると、同じ状態が
 * 別のものに見える。
 */
export function DifficultBadge({
  forms,
  compact = false,
}: {
  /** 困難な形式。両方なら2つ */
  forms: PromptForm[];
  /** 一覧の閉じた巻物のように幅が無い場所では「困難」に詰める */
  compact?: boolean;
}) {
  if (forms.length === 0) return null;
  const names = forms.map((form) => (form === "word" ? "単語" : "短文")).join("と");

  return (
    <span
      title={`${names}のお題の生成が難しい`}
      className="inline-flex items-center gap-0.5 rounded-full border border-kinari/20 px-1 py-px text-[10px] leading-4 whitespace-nowrap text-kinari/50"
    >
      {forms.map((form) =>
        form === "word" ? (
          <WordMark key={form} className="size-3.5" />
        ) : (
          <SentenceMark key={form} className="size-3.5" />
        ),
      )}
      {compact ? "困難" : "生成困難"}
    </span>
  );
}

/** テーマの2つの印を、困難な形式の配列に畳む */
export function difficultForms(theme: {
  kind: "theme" | "constraint";
  generationStatus: "ok" | "difficult";
  wordGenerationStatus: "ok" | "difficult";
}): PromptForm[] {
  const forms: PromptForm[] = [];
  if (theme.generationStatus === "difficult") forms.push("sentence");
  // 最適化練習に単語モードは無いので、単語の印は見ない
  if (theme.kind === "theme" && theme.wordGenerationStatus === "difficult") forms.push("word");
  return forms;
}
