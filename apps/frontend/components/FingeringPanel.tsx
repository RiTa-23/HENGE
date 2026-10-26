"use client";

import { useEffect, useState } from "react";
import { FingeringEditor } from "@/components/FingeringEditor";
import { FingeringPosts } from "@/components/FingeringPosts";
import {
  type Fingering,
  isDefaultFingering,
  readFingering,
  writeFingering,
} from "@/lib/practice/fingering";

/**
 * 最適化の運指の欄。**自分の運指の設定**（`FingeringEditor`）と、**みんなが投稿した運指**
 * （`FingeringPosts`）を1つにまとめる。詳細ページとプレイの開始前の両方に置く。
 *
 * 投稿を「使う」と、自分の運指（localStorage）に写して設定の欄を読み直す。
 * 設定の欄で変えた運指は、そのまま投稿できる。
 */
export function FingeringPanel({
  themeId,
  sound,
  base = null,
  onChange,
}: {
  themeId: string;
  sound: string;
  /** その最適化の既定の運指（作成者と運営が決めたもの）。無ければ null */
  base?: Fingering | null;
  /** 画面に出す運指が変わったとき。標準運指なら null */
  onChange?: (fingering: Fingering | null) => void;
}) {
  /** 設定の欄を読み直させるための番号（投稿を使ったら localStorage を書き換えてある） */
  const [revision, setRevision] = useState(0);
  /** いま画面に出す運指。投稿の欄の「使用中」と、投稿する運指に使う */
  const [current, setCurrent] = useState<Fingering | null>(null);

  // 初回描画では既定で描き、描画してから読む（FingeringEditor と同じく hydration を壊さない）
  useEffect(() => {
    setCurrent(readFingering(sound) ?? base);
  }, [sound, base]);

  const showing = (next: Fingering | null) => {
    setCurrent(next);
    onChange?.(next === null || isDefaultFingering(sound, next) ? null : next);
  };

  return (
    <div className="grid gap-10">
      <FingeringEditor
        key={revision}
        sound={sound}
        base={base}
        onChange={(next) => showing(next)}
      />
      <section aria-label="みんなの運指" className="grid gap-4">
        <h3 className="text-sm tracking-[0.25em] text-kinari/60">みんなの運指</h3>
        <FingeringPosts
          themeId={themeId}
          sound={sound}
          current={current}
          onUse={(fingering) => {
            writeFingering(sound, fingering, base);
            setRevision((n) => n + 1);
            showing(fingering);
          }}
        />
      </section>
    </div>
  );
}
