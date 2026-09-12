"use client";

import { accuracyRatio, keysPerSecond, type PromptForm, RANKING_SIZE } from "@henge/shared";
import { useState } from "react";
import { FormMark } from "@/components/FormMark";
import type { RankingEntry } from "@/lib/api/rankings";
import { formLabel } from "@/lib/ui/kind";

/**
 * 詳細ページのランキング。**短文と単語は別の表**で、タブで切り替える。
 *
 * 両方の表をサーバーで描いて渡し、切り替えだけをクライアントで持つ（最大100件×2なので
 * 取り直す方が重い）。最適化する音は短文だけなので、表が1つのときはタブを出さない。
 *
 * 名前は `user.display_name`（登録時の名前ではなく、いまの名前）。値は結果画面と
 * 同じ関数（`packages/shared/src/score.ts`）から出すので、表記が食い違わない。
 */
export function RankingBoard({
  boards,
  initialForm,
}: {
  boards: { form: PromptForm; entries: RankingEntry[] }[];
  /** `?ranking=word` などで指定のタブから開く（結果画面の「ランキングを見る」）。無ければ先頭 */
  initialForm?: PromptForm;
}) {
  const [form, setForm] = useState<PromptForm>(
    initialForm !== undefined && boards.some((board) => board.form === initialForm)
      ? initialForm
      : (boards[0]?.form ?? "sentence"),
  );
  const current = boards.find((board) => board.form === form);

  return (
    <section id="ranking" className="mt-16 scroll-mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-mincho text-xl tracking-wide text-kinari">ランキング</h2>
        {boards.length > 1 && (
          <div role="tablist" className="flex gap-2">
            {boards.map((board) => {
              const selected = board.form === form;
              return (
                <button
                  key={board.form}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setForm(board.form)}
                  className={
                    selected
                      ? "flex items-center gap-1.5 rounded-full border border-kin px-4 py-1 text-sm tracking-widest text-kinari"
                      : "flex items-center gap-1.5 rounded-full border border-kinari/15 px-4 py-1 text-sm tracking-widest text-kinari/60 hover:text-kinari"
                  }
                >
                  <FormMark form={board.form} className="size-3.5 text-kin" />
                  {formLabel(board.form)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm leading-loose text-kinari/60">
        上位{RANKING_SIZE}件。1人につきベストスコア1件で、結果画面から登録できます。
      </p>

      {current === undefined || current.entries.length === 0 ? (
        <p className="mt-8 text-kinari/50">まだ記録がありません。最初の1人になれます。</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-kin/40 text-left tracking-widest text-kinari/50">
                <th className="py-3 pr-4 font-normal">順位</th>
                <th className="py-3 pr-4 font-normal">名前</th>
                <th className="py-3 pr-4 text-right font-normal">スコア</th>
                <th className="py-3 pr-4 text-right font-normal">打鍵/秒</th>
                <th className="py-3 text-right font-normal">正確率</th>
              </tr>
            </thead>
            <tbody>
              {current.entries.map((entry) => (
                <tr key={entry.userId} className="border-b border-kinari/5">
                  <td className="py-3 pr-4 font-mono text-kinari/70">{entry.rank}</td>
                  <td className="py-3 pr-4 text-kinari">
                    {/* td の max-width は自動レイアウトの表では効かないので、中の要素で切る */}
                    <span className="block max-w-48 truncate">{entry.displayName ?? "名無し"}</span>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-kin">{entry.score}</td>
                  <td className="py-3 pr-4 text-right font-mono text-kinari/70">
                    {keysPerSecond(entry).toFixed(1)}
                  </td>
                  <td className="py-3 text-right font-mono text-kinari/70">
                    {Math.floor(accuracyRatio(entry) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
