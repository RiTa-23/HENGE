"use client";

import { playSize, type PromptForm } from "@henge/shared";
import { useEffect, useRef, useState } from "react";
import { formLabel } from "@/lib/ui/kind";
import { isStartSpace, SPACE_OWNER_SELECTOR } from "@/lib/ui/shortcut";
import "@/components/play/ninja.css";

/** 押してからプレイへ移るまで。印が沈んで持ち上がり、印影が残るまでの長さ（`ninja.css`） */
const STAMP_MS = 900;

/** 印の下の副題に使う漢数字。1プレイの問題数（10・20）だけ書ければよい */
const KANJI_COUNT: Record<number, string> = { 10: "十", 20: "二十" };

/**
 * 「打つ」ボタン。**朱印。** 形式が1つしかないモード（最適化練習・ごちゃまぜ）の詳細で使う。
 *
 * 木札（`FormButton`）は「形式を選ぶ」ための札で、1枚だけだと巻物・的板の中に吊るし
 * 忘れのように見える。印は1つ押すのが自然な道具で、「ボタンを押す＝判を押す」が重なる。
 * 朱は「今すぐ打つべきもの」の色で、詳細ページで朱を使うのはここだけ（docs/07-ui.md）。
 *
 * - 押すと印が沈んで持ち上がり、紙に印影が残ってからプレイへ移る
 * - **新しいタブで開く操作（修飾キー・中クリック）は奪わない。** 普通のリンクのまま
 * - 視差効果を減らす設定では演出を飛ばしてすぐ移る
 * - Space でも押せる（プレイ画面の開始と同じ手）。フォーカスがボタンや入力欄にあるときは拾わない
 */
export function SealButton({
  href,
  form = "sentence",
  note,
  difficult = false,
}: {
  href: string;
  form?: PromptForm;
  /** 副題の下に添える一言。省略時は Space の案内 */
  note?: string;
  /** そのプールが「生成困難」。印をくすませて示す（`FormButton` の `difficult` と同じ） */
  difficult?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const press = () => {
    if (pressed) return;
    if (globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      globalThis.location.assign(href);
      return;
    }
    setPressed(true);
    timer.current = setTimeout(() => globalThis.location.assign(href), STAMP_MS);
  };

  // 最新の press を窓のハンドラから呼ぶ（登録し直さずに済ませる）
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const targetIsInteractive = target?.closest?.(SPACE_OWNER_SELECTOR) != null;
      if (!isStartSpace({ ...pick(event), targetIsInteractive })) return;
      // スペースでの画面スクロールを止める
      event.preventDefault();
      pressRef.current();
    };
    /**
     * ブラウザバックで戻ってきたときに、押した後の見た目（印が消えて印影だけ）の
     * まま固まるのを防ぐ。bfcache から復元されると state もそのまま戻る
     */
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (timer.current !== null) clearTimeout(timer.current);
      setPressed(false);
    };
    globalThis.addEventListener("keydown", onKey);
    globalThis.addEventListener("pageshow", onPageShow);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
      globalThis.removeEventListener("pageshow", onPageShow);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const size = playSize(form);
  const caption = `${formLabel(form)}・${KANJI_COUNT[size] ?? size}問`;

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className={`seal${pressed ? " seal--pressed" : ""}${difficult ? " seal--difficult" : ""}`}
      >
        <span className="seal__print" aria-hidden="true">
          打
        </span>
        <a
          href={href}
          className="seal__face"
          aria-label={`打つ（${caption}）`}
          title={
            difficult ? `${formLabel(form)}のお題の生成が難しい（在庫があれば遊べます）` : undefined
          }
          onClick={(event) => {
            // 新しいタブ・ウィンドウで開く操作はリンクの既定の動きに任せる
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            press();
          }}
        >
          <span aria-hidden="true">打</span>
        </a>
      </div>
      <p className="text-center">
        <span className="block font-mincho tracking-[0.3em] text-kinari">{caption}</span>
        <span className="mt-2 block text-xs tracking-widest text-kinari/50">
          {note ?? "Space でも押せます"}
        </span>
      </p>
    </div>
  );
}

function pick(event: KeyboardEvent) {
  return {
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  };
}
