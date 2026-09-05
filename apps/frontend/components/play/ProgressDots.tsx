import { PLAY_SIZE } from "@henge/shared";

/**
 * 進捗は**問題数ドット**。タイマーは置かない（時間制限はミスを誘発する）。
 * 済んだ問題は金（進行中・完了）、いま解いている問題だけ朱。
 */
export function ProgressDots({ current, total = PLAY_SIZE }: { current: number; total?: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <span
            key={index}
            className={
              state === "done"
                ? "size-2.5 rounded-full bg-kin"
                : state === "current"
                  ? "size-2.5 rounded-full bg-shu"
                  : "size-2.5 rounded-full border border-kin/40"
            }
          />
        );
      })}
    </div>
  );
}
