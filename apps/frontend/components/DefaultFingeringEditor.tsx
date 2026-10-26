"use client";

import { isApiError } from "@henge/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FingeringPicker } from "@/components/FingeringEditor";
import {
  encodeFingering,
  type Fingering,
  isDefaultFingering,
  sameFingering,
} from "@/lib/practice/fingering";

/**
 * 最適化の既定の運指を後から変える（作成者と運営だけ。出すかどうかはページ側で判定する）。
 *
 * 選ぶ部品は作成フォームと同じ `FingeringPicker`。**選んだだけでは保存しない。** 既定は
 * 遊ぶ全員に効くので、押し間違いがそのまま広まらないよう「既定にする」で確定させる。
 * 保存したらページを読み直し、遊ぶ人向けの欄（`FingeringEditor`）の既定も入れ替える。
 */
export function DefaultFingeringEditor({
  themeId,
  sound,
  current,
}: {
  themeId: string;
  /** 最適化する音 */
  sound: string;
  /** いまの既定の運指。決めていなければ null（標準運指） */
  current: Fingering | null;
}) {
  const router = useRouter();
  /** 選んでいる運指。null は標準運指 */
  const [draft, setDraft] = useState<Fingering | null>(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unchanged = sameFingering(sound, draft, current);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/themes/fingering", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, fingering: draft === null ? null : encodeFingering(draft) }),
    });
    const body: unknown = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(isApiError(body) ? body.error.message : "保存できませんでした");
      return;
    }
    setMessage("既定の運指を変えました");
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <FingeringPicker
        sound={sound}
        value={draft}
        // 標準運指と同じなら決めていない扱い（保存しても既定は外れる）
        onChange={(next) =>
          setDraft(next === null || isDefaultFingering(sound, next) ? null : next)
        }
      />
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || unchanged}
          className="rounded-md border border-shu bg-shu/15 px-6 py-2 text-sm tracking-widest text-kinari transition-colors hover:bg-shu/25 disabled:border-kinari/15 disabled:bg-transparent disabled:text-kinari/30"
        >
          {draft === null ? "標準の運指を既定にする" : "この運指を既定にする"}
        </button>
        {message !== null && <p className="text-sm text-kinari/60">{message}</p>}
      </div>
    </div>
  );
}
