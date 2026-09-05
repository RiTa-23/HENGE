import { Shuriken } from "./Shuriken";
import "./ninja.css";

interface LoadingProps {
  /** いま何を待っているか。1行で言い切る */
  message: string;
  /** 補足。待ち時間の見当や注意を1行だけ添える */
  note?: string;
}

/**
 * 生成待ちの画面。
 *
 * **進捗バーに朱を使わない。** 朱は「今すぐ打つべきもの」専用で、待ち時間に
 * 使うと色の意味が薄まる（docs/07-ui.md）。金で表す。
 * 実際の進捗は取得できないので、バーは往復させて「動いている」ことだけ示す。
 */
export function Loading({ message, note }: LoadingProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-kin/60 bg-kinari/5 px-10 py-12">
        <h1 className="text-center font-mincho text-3xl tracking-widest text-kinari">準備中</h1>

        <div className="my-10 flex justify-center">
          <Shuriken size={92} />
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-kinari/15">
          <div className="h-full w-1/3 animate-[loading-sweep_1.8s_ease-in-out_infinite] rounded-full bg-kin" />
        </div>

        <p className="mt-5 text-center text-sm text-kinari/80">{message}</p>
        {note !== undefined && <p className="mt-6 text-sm text-kinari/50">＊ {note}</p>}
      </div>
    </div>
  );
}
