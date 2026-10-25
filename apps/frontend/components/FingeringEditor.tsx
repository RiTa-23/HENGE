"use client";

import { useEffect, useState } from "react";
import { HandFigure } from "@/components/play/FingerGuide";
import { type Finger, fingerLabel } from "@/lib/play/fingers";
import {
  type Fingering,
  fingeringUnits,
  isDefaultFingering,
  readFingering,
  resolveFingering,
  romanChoices,
  standardFingers,
  standardUnit,
  type UnitFingering,
  writeFingering,
} from "@/lib/practice/fingering";

function sameFinger(a: Finger | undefined, b: Finger | undefined): boolean {
  return a?.hand === b?.hand && a?.finger === b?.finger;
}

/** 打ち方1文字ぶん。キーと、それを押す指を左右の手の図で選ぶ */
function LetterRow({
  letter,
  finger,
  standard,
  onPick,
}: {
  letter: string;
  finger: Finger | undefined;
  standard: Finger | undefined;
  onPick: (finger: Finger) => void;
}) {
  const pickLabel = (f: Finger) => `${letter.toUpperCase()} を${fingerLabel(f)}で押す`;
  return (
    <li className="flex items-center gap-4">
      {/* キーはキーボードの刻印と同じ大文字で出す */}
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded border border-kinari/30 font-mono text-sm text-kinari">
        {letter.toUpperCase()}
      </span>
      <div className="flex items-end gap-3">
        <HandFigure hand="left" press={finger ?? null} onPick={onPick} pickLabel={pickLabel} />
        <HandFigure hand="right" press={finger ?? null} onPick={onPick} pickLabel={pickLabel} />
      </div>
      {/* 幅を固定する。指の名前の長さで手の図が左右に揺れない（運指ガイドと同じ） */}
      <p className="w-28 text-xs leading-relaxed tracking-widest">
        <span className="text-daidai">{finger === undefined ? "―" : fingerLabel(finger)}</span>
        {/* 標準と違う指にしたら、標準が何だったかを添える */}
        {standard !== undefined && !sameFinger(finger, standard) && (
          <span className="block text-kinari/40">標準は{fingerLabel(standard)}</span>
        )}
      </p>
    </li>
  );
}

/** かな1単位ぶん。打ち方を一覧から選び、その各文字の指を選ぶ */
function UnitEditor({
  kana,
  unit,
  onChange,
}: {
  kana: string;
  unit: UnitFingering;
  onChange: (unit: UnitFingering) => void;
}) {
  const standard = standardFingers(unit.roman) ?? [];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mincho text-2xl text-kinari">{kana}</span>
        <div
          role="radiogroup"
          aria-label={`「${kana}」の打ち方`}
          className="flex flex-wrap gap-1.5"
        >
          {romanChoices(kana).map((roman) => {
            const selected = roman === unit.roman;
            return (
              <button
                key={roman}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  // 打ち方を替えたら指は標準運指から選び直す（文字の数も並びも変わる）
                  const next = standardUnit(roman);
                  if (next !== null && !selected) onChange(next);
                }}
                className={`rounded-full border px-3 py-0.5 font-mono text-sm tracking-wider transition-colors ${
                  selected
                    ? "border-kin bg-kin/15 text-kinari"
                    : "border-kinari/15 text-kinari/50 hover:border-kin hover:text-kinari"
                }`}
              >
                {roman}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="grid gap-3">
        {[...unit.roman].map((letter, j) => (
          <LetterRow
            // 打ち方を替えると同じ位置に別の文字が来るので、文字ごと作り直す
            key={`${unit.roman}-${j}`}
            letter={letter}
            finger={unit.fingers[j]}
            standard={standard[j]}
            onPick={(finger) =>
              onChange({ ...unit, fingers: unit.fingers.map((f, k) => (k === j ? finger : f)) })
            }
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * 最適化の運指の設定。最適化する音を**どの打ち方で、どの指で打つか**を決める
 * （`lib/practice/fingering.ts`）。プレイ中、的の箇所ではここで決めた打ち方を
 * ローマ字列に出し、決めた指を運指ガイドに出す。
 *
 * 置き場所は2つ。**プレイの開始前**（`PlayScreen`。打つ直前に決め直せる）と、
 * **最適化する音の詳細ページ**（`/practice/[char]`）。どちらも同じ localStorage を読み書きする
 * （匿名ユーザーのデータをサーバーに持たない＝不変条件10）。
 *
 * 決め方は「打ち方を一覧から選ぶ → その各文字の指を手の図で選ぶ」の順。
 * 「し」なら `si` / `shi` / `ci` から選び、`s` `h` `i` それぞれの指を選ぶ。
 *
 * **初回描画では既定（標準運指）で描き、描画してから読む。** 初回描画で localStorage を
 * 読むと、サーバーの出力と食い違って hydration が壊れる（プレイ画面の設定と同じ）。
 */
export function FingeringEditor({
  sound,
  onChange,
}: {
  /** 最適化する音（「き」「でき」） */
  sound: string;
  /** 変えたときに呼ぶ。標準に戻したら null */
  onChange?: (fingering: Fingering | null) => void;
}) {
  const [saved, setSaved] = useState<Fingering | null>(null);

  useEffect(() => {
    setSaved(readFingering(sound));
  }, [sound]);

  const units = fingeringUnits(sound);
  const resolved = resolveFingering(sound, saved);

  const update = (next: Fingering | null) => {
    writeFingering(sound, next);
    // 既定と同じものは持たない（保存側と同じ判断で、画面の「標準に戻す」も揃える）
    const kept = next === null || isDefaultFingering(sound, next) ? null : next;
    setSaved(kept);
    onChange?.(kept);
  };

  return (
    <div className="grid gap-6 text-left">
      {units.map((kana, i) => {
        const unit = resolved.units[i];
        if (unit == null) {
          return (
            <p key={i} className="text-xs leading-relaxed text-kinari/50">
              <span className="mr-3 font-mincho text-2xl text-kinari">{kana}</span>
              前後のかなで打ち方が変わるため、標準の運指のままです。
            </p>
          );
        }
        return (
          <UnitEditor
            key={i}
            kana={kana}
            unit={unit}
            onChange={(changed) =>
              update({ units: resolved.units.map((u, j) => (j === i ? changed : u)) })
            }
          />
        );
      })}

      <div>
        <button
          type="button"
          onClick={() => update(null)}
          disabled={saved === null}
          className="rounded-full border border-kinari/15 px-4 py-1 text-xs tracking-widest text-kinari/60 transition-colors hover:border-kin hover:text-kinari disabled:cursor-default disabled:opacity-40 disabled:hover:border-kinari/15 disabled:hover:text-kinari/60"
        >
          標準の運指に戻す
        </button>
      </div>
    </div>
  );
}
