import type { ReactNode } from "react";
import "@/components/play/ninja.css";

/**
 * 詳細ページ（テーマ／最適化する音）の主役。**広げた巻物1本に、名前・説明・
 * 在庫・「打つ」ボタンを載せる。**
 *
 * 一覧のカード（閉じた巻物）を押すとここに来る。**押した巻物が広がった先**として
 * 同じ物体（`.scroll`。プレイ画面と同じ軸・キャップ・紙）で受けると、一覧 → 詳細 →
 * プレイが1本の巻物で繋がる。以前は素の見出しと表だけで、HENGEの画面に見えなかった。
 *
 * - 紋（`ThemeMark` / `PracticeMark`）は**見出しの肩に小さく**置く。どちらの
 *   モードの詳細かの識別で、それ以上の装飾にはしない
 * - 金は**細い罫線と紋の線**まで。面で使わない（docs/07-ui.md）
 * - 朱は「打つ」ボタンだけ（今すぐ打つべきもの）
 *
 * ページごとに変わるもの（紋・肩の文言・説明・在庫の並び・ボタン）は props で渡す。
 */
export function DetailScroll({
  mark,
  eyebrow,
  title,
  description,
  stats,
  actions,
}: {
  /** モードの紋。`text-kin` の線画として描かれる */
  mark: ReactNode;
  /** 見出しの肩に置く短い語（「テーマ」「最適化する音」） */
  eyebrow: string;
  title: string;
  description: ReactNode;
  /** 在庫・プレイ回数など。値は等幅・金で出す */
  stats: { label: string; value: number; unit?: string }[];
  /** 「打つ」ボタン。朱で描かれる前提 */
  actions: ReactNode;
}) {
  return (
    // キャップが軸の上下に16pxずつ張り出すので、そのぶん外側に余白を取る。
    // 狭い画面での軸の太さは .scroll--detail（ninja.css）が持つ
    <div className="scroll scroll--detail my-6">
      <div className="scroll__roller" />
      <div className="scroll__sheet px-6 py-10 sm:px-12 sm:py-12">
        <p className="flex items-center gap-2 text-sm tracking-[0.25em] text-kinari/50">
          <span className="text-kin">{mark}</span>
          {eyebrow}
        </p>
        <h1 className="mt-3 font-mincho text-3xl leading-snug tracking-wide text-kinari sm:text-4xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl leading-loose text-kinari/70">{description}</p>

        {/* 金は細い線まで。紙の折り目のような1本で、説明と数字を分ける */}
        <hr className="my-8 border-0 border-t border-kin/50" />

        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs tracking-widest text-kinari/50">{stat.label}</dt>
              <dd className="mt-1 font-mono text-2xl text-kin">
                {stat.value}
                {stat.unit !== undefined && (
                  <span className="ml-1 text-xs text-kinari/50">{stat.unit}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap gap-4">{actions}</div>
      </div>
      <div className="scroll__roller" />
    </div>
  );
}
