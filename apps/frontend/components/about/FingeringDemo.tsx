"use client";

import { useEffect, useState } from "react";
import { HandFigure } from "@/components/play/FingerGuide";
import { type Finger, fingerLabel, fingerOf } from "@/lib/play/fingers";
import { type MiniKeyState, MiniKeyboard } from "./MiniKeyboard";

/**
 * 「最適化とは？」の動く図。同じ音を**標準運指と最適化した運指で並べて打ってみせる。**
 *
 * キーボードと手の図はプレイ画面と同じ塗り（押すキー・押す指が橙）。説明で見た動きが、
 * そのままプレイ中の運指ガイドの見え方になる。
 *
 * 標準の指は `fingerOf()` から引き、ここには書かない（標準運指とずれないように）。
 * 書くのは最適化で**変える指だけ**。
 */

interface DemoExample {
  kana: string;
  roman: string;
  /** 最適化で変える指（ローマ字の位置 → 指）。書かない位置は標準運指のまま */
  optimized: Record<number, Finger>;
}

const EXAMPLES: DemoExample[] = [
  { kana: "き", roman: "ki", optimized: { 0: { hand: "right", finger: "index" } } },
  { kana: "で", roman: "de", optimized: { 0: { hand: "left", finger: "index" } } },
  { kana: "ざ", roman: "za", optimized: { 0: { hand: "left", finger: "ring" } } },
];

interface Stroke {
  key: string;
  finger: Finger;
  /** 標準運指から変えた指か */
  changed: boolean;
}

function strokesOf(example: DemoExample, optimize: boolean): Stroke[] {
  return [...example.roman.toUpperCase()].map((key, index) => {
    const chosen = optimize ? example.optimized[index] : undefined;
    // 例に出す字はすべてキーボードの文字段にある
    const finger = chosen ?? fingerOf(key)!;
    return { key, finger, changed: chosen !== undefined };
  });
}

function sameFinger(a: Finger, b: Finger): boolean {
  return a.hand === b.hand && a.finger === b.finger;
}

/** 1打ぶんの間（ミリ秒）。2打のあと2拍休んで繰り返す */
const BEAT = 750;
const CYCLE = 4;

function Panel({
  title,
  strokes,
  step,
  onPick,
}: {
  title: string;
  strokes: Stroke[];
  /** いま押している打鍵の位置。休みの拍なら打鍵数以上 */
  step: number;
  onPick: (step: number) => void;
}) {
  const current = strokes[step] ?? null;
  const states: Partial<Record<string, MiniKeyState>> = {};
  for (const stroke of strokes) states[stroke.key] = "mark";
  if (current !== null) states[current.key] = "press";

  const repeated = strokes.some((stroke, index) => {
    const previous = strokes[index - 1];
    return previous !== undefined && sameFinger(previous.finger, stroke.finger);
  });

  return (
    <div className="flex flex-col items-center rounded border border-kinari/15 px-3 py-5">
      <p className="text-xs tracking-[0.3em] text-kinari/50">{title}</p>
      <div className="mt-4">
        <MiniKeyboard states={states} />
      </div>
      <div className="mt-5 flex items-end gap-5">
        <HandFigure hand="left" press={current?.finger ?? null} />
        <HandFigure hand="right" press={current?.finger ?? null} />
      </div>
      <ol className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
        {strokes.map((stroke, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-kinari/30">→</span>}
            <button
              type="button"
              onClick={() => onPick(index)}
              aria-pressed={index === step}
              className={`rounded border px-2 py-1 text-xs transition-colors ${
                index === step ? "border-daidai" : "border-kinari/15 hover:border-kin"
              }`}
            >
              <span className="font-mono text-sm text-kinari">{stroke.key}</span>{" "}
              <span className={stroke.changed ? "text-daidai" : "text-kinari/60"}>
                {fingerLabel(stroke.finger)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className={`mt-4 text-sm tracking-wider ${repeated ? "text-kinari/50" : "text-kin"}`}>
        {repeated ? "同じ指が2回続く" : "別々の指で打てる"}
      </p>
    </div>
  );
}

export function FingeringDemo() {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [step, setStep] = useState(0);
  // 初回描画は止めて描き、描画してから動かす（hydration を壊さない）。
  // 視差効果を減らす設定なら動かさない（打鍵は札を押して1つずつ見られる）
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setStep((value) => (value + 1) % CYCLE), BEAT);
    return () => clearInterval(id);
  }, [playing]);

  const example = EXAMPLES[exampleIndex] ?? EXAMPLES[0]!;

  function pick(index: number) {
    setPlaying(false);
    setStep(index);
  }

  return (
    <figure className="rounded border border-kin/40 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="例にする音">
          {EXAMPLES.map((item, index) => (
            <button
              key={item.kana}
              type="button"
              aria-pressed={index === exampleIndex}
              onClick={() => {
                setExampleIndex(index);
                setStep(0);
              }}
              className={`flex items-baseline gap-1.5 rounded border px-3 py-1 transition-colors ${
                index === exampleIndex
                  ? "border-kin text-kinari"
                  : "border-kinari/15 text-kinari/50 hover:border-kin"
              }`}
            >
              <span className="font-mincho text-xl">{item.kana}</span>
              <span className="font-mono text-xs">{item.roman}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          className="text-xs tracking-widest text-kinari/50 hover:text-kinari"
        >
          {playing ? "止める" : "動かす"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Panel title="標準運指" strokes={strokesOf(example, false)} step={step} onPick={pick} />
        <Panel title="最適化" strokes={strokesOf(example, true)} step={step} onPick={pick} />
      </div>
      <figcaption className="mt-4 text-center text-xs leading-relaxed text-kinari/50">
        <span className="text-daidai">橙の指</span>が、標準運指から変えたところ
      </figcaption>
    </figure>
  );
}
