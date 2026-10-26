"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { fitScale } from "@/lib/ui/fit";

/**
 * 中身を**1画面に収める**枠。高さが足りなければ、中身ごと縮小する。
 *
 * プレイ画面と結果画面に使う。ノートPCの低い画面では、巻物・キーボード・
 * 運指ガイドが縦にはみ出し、打っている最中にスクロールが要った。まず
 * 高さの低い画面で余白を詰め（`short:`。globals.css）、それでも入らない
 * ぶんだけここで縮める。
 *
 * 縮小は `transform` で行い、外側の箱の高さを縮めたあとの高さに合わせる
 * （transform はレイアウトの大きさを変えないため）。**中に `position: fixed`
 * を置かない。** transform の中では画面ではなくこの箱が基準になる
 * （モーダルはポータルで `document.body` に出す。ReportPanel）。
 *
 * 縮小率は画面の大きさが同じあいだは小さくなる方にしか動かさない（`fitScale`）。
 *
 * 親は高さを決めておくこと（`h-dvh` など）。この枠はその高さいっぱいに広がる。
 */
export function FitScreen({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const frameEl = frame.current;
    const contentEl = content.current;
    if (frameEl === null || contentEl === null) return;
    let size = "";
    let scale: number | undefined;
    const measure = () => {
      const available = frameEl.clientHeight;
      const current = `${frameEl.clientWidth}x${available}`;
      // 画面の大きさが変わったら測り直す（大きくなったなら戻してよい）
      if (current !== size) scale = undefined;
      size = current;
      // offsetHeight は transform の影響を受けない（縮める前の高さ）
      const natural = contentEl.offsetHeight;
      scale = fitScale(natural, available, scale);
      setFit({ scale, height: natural * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, []);

  const scaled = fit !== null && fit.scale < 1;
  return (
    // 縮められないとき（描画直後など）でも見切れないよう、スクロールは残す
    <div ref={frame} className="flex h-full w-full flex-col overflow-y-auto">
      <div className="my-auto w-full shrink-0" style={scaled ? { height: fit.height } : undefined}>
        <div
          ref={content}
          className="w-full origin-top"
          style={scaled ? { transform: `scale(${fit.scale})` } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
