/**
 * 効果音の入/切。**プレイ中と開始前の両方に出す。**
 *
 * 打ち始めてから消したくなることもあれば、始める前に消したくなることもある。
 * 開始前にしか無いと打鍵中は消せず、プレイ中にしか無いと「鳴ると分かってから
 * 消す」しかできない。
 *
 * **トグルスイッチで出す。** 「音入/音切」のラベル差し替えは、いまどちらの
 * 状態か一目で読めない。軌道とつまみの位置＋ON/OFF表記で状態を示す。
 */
export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  const on = !muted;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      aria-label="効果音"
      className="flex items-center gap-2 rounded-full border border-kinari/15 px-3 py-1.5 text-xs tracking-widest text-kinari/60 transition-colors hover:border-kin hover:text-kinari"
    >
      音
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
          on ? "bg-kin/80" : "bg-kinari/15"
        }`}
      >
        <span
          className={`absolute left-0.5 h-3 w-3 rounded-full bg-kinari transition-transform ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      <span className={`font-mono ${on ? "text-kinari" : "text-kinari/40"}`}>
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
