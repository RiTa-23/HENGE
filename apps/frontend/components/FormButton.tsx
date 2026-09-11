import { playSize, type PromptForm } from "@henge/shared";
import { SentenceMark, WordMark } from "@/components/FormMark";

/**
 * 「打つ」ボタン。**木札（きふだ）の形。**
 *
 * 一覧の巻物と詳細の巻物の両方で使う。角を1つ落として紐穴を空けた札で、
 * 巻物に結わえた札を引くとその形式で打ち始まる、という見立て。
 *
 * **朱は両方とも同じ。** 朱は「今すぐ打つべきもの」の色で、形式で色を変えると
 * その意味が薄まる。見分けは紋（`FormMark`）と文字で付ける。
 *
 * 角の落としは `clip-path`。枠線は clip で切れてしまうので、内側の影
 * （`shadow-[inset_…]`）で描く。落とした角に枠が無いのは、削った木の断面として
 * そのままにしてある。紐穴は大きい札だけに空ける（小さい札では黒い点にしか見えない）。
 */
export function FormButton({
  form,
  href,
  size = "sm",
  label,
}: {
  form: PromptForm;
  href: string;
  /** 一覧は sm（1行）、詳細は lg（問題数の副題つき） */
  size?: "sm" | "lg";
  /** 既定は「短文」「単語」（紋と札の形で「打てる」ことは伝わるので、動詞を付けない）。最適化練習は「打つ」 */
  label?: string;
}) {
  const Mark = form === "word" ? WordMark : SentenceMark;
  const text = label ?? (form === "word" ? "単語" : "短文");
  const large = size === "lg";

  return (
    <a
      href={href}
      className={
        "group relative flex items-center gap-1.5 bg-shu/15 text-kinari shadow-[inset_0_0_0_1px_var(--color-shu)] transition-colors hover:bg-shu/30 " +
        "[clip-path:polygon(12px_0,100%_0,100%_100%,0_100%,0_12px)] " +
        // 紐穴は大きい札だけ。小さい札では落とした角と穴が近すぎて、穴が
        // 黒い点にしか見えない（一覧の巻物で実際に気になった）。角の落としだけで
        // 木札と分かるので、小さい方は穴を空けない
        (large
          ? "min-w-48 py-3 pr-6 pl-7 before:absolute before:top-2.5 before:left-2.5 before:size-1.5 before:rounded-full before:bg-sumi"
          : "py-1.5 pr-2.5 pl-4")
      }
    >
      <Mark className={large ? "size-6 shrink-0 text-shu" : "size-3.5 shrink-0 text-shu"} />
      <span className="min-w-0">
        <span
          className={
            large
              ? "block font-gothic text-lg tracking-[0.2em]"
              : "block text-xs tracking-widest whitespace-nowrap"
          }
        >
          {text}
        </span>
        {large && (
          <span className="mt-0.5 block font-mono text-xs tracking-normal text-kinari/60">
            {playSize(form)}問ひと組
          </span>
        )}
      </span>
    </a>
  );
}
