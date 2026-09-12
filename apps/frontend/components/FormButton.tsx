import { playSize, type PromptForm } from "@henge/shared";
import { FormMark } from "@/components/FormMark";
import { formColor, formLabel } from "@/lib/ui/kind";
import "@/components/play/ninja.css";

/**
 * 「打つ」ボタン。**木札（きふだ）。**
 *
 * 一覧の巻物と詳細の巻物の両方で使う。巻物に結わえた木の札を引くとその形式で
 * 打ち始まる、という見立て。**縦長で縦書き**、上に紐穴と紐（`ninja.css` の `.kifuda`）。
 * 地は木肌の色で、文字は墨。**形式の識別色（`formColor`）は紐と紋にだけ乗せる**
 * （札そのものを染めると木ではなく色紙に見える）。
 *
 * 以前は角を1つ落とした横長の札に半透明の色を敷いていたが、チップに見えて
 * 世界観から浮いたのでやめた。
 *
 * 一覧は小（紋＋2文字）、詳細は大（紋＋文字＋問題数の副題）。どちらも横に並べて吊るす。
 */
export function FormButton({
  form,
  href,
  size = "sm",
  label,
  difficult = false,
}: {
  form: PromptForm;
  href: string;
  /** 一覧は sm、詳細は lg（問題数の副題つき） */
  size?: "sm" | "lg";
  /** 既定は形式の呼び名「単語」「短文」「長文」。最適化練習は「打つ」 */
  label?: string;
  /**
   * その形式のプールが「生成困難」（`generation_status`）。札を暗くくすませて示す。
   * 以前は紋を並べたバッジ（`DifficultBadge`）を別に置いていたが、形式ごとの状態は
   * その形式の札そのものに出す方が対応が読める。管理画面だけ札が無いのでバッジのまま
   */
  difficult?: boolean;
}) {
  const text = label ?? formLabel(form);
  const large = size === "lg";
  const color = formColor(form);

  return (
    <a
      href={href}
      className={`kifuda ${large ? "kifuda--lg" : "kifuda--sm"}${difficult ? " kifuda--difficult" : ""}`}
      title={difficult ? `${text}のお題の生成が難しい（在庫があれば遊べます）` : undefined}
      // 紐の色は形式ごと。CSS 変数で渡し、クラスは書き切る（Tailwind が拾うのは紋の側）
      style={{ "--kifuda-cord": `var(--color-${color.token})` } as React.CSSProperties}
    >
      <FormMark form={form} className={`${large ? "size-6" : "size-4"} shrink-0 ${color.text}`} />
      <span
        className={
          large ? "font-mincho text-lg tracking-[0.3em]" : "font-mincho text-xs tracking-[0.2em]"
        }
      >
        {text}
      </span>
      {large && (
        <span className="font-gothic text-[11px] tracking-[0.15em] opacity-75">
          {/* 縦書きの中で数字だけ横に組む（縦中横）。1文字ずつ倒れると読めない */}
          {form === "long" ? (
            "一本"
          ) : (
            <>
              <span className="[text-combine-upright:all]">{playSize(form)}</span>問
            </>
          )}
        </span>
      )}
    </a>
  );
}
