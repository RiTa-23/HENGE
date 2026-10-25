/**
 * 表示・効果音の設定の入/切（音・運指・大文字）。**プレイ中と開始前の両方に出す。**
 *
 * 打ち始めてから消したくなることもあれば、始める前に消したくなることもある。
 * 開始前にしか無いと打鍵中は消せず、プレイ中にしか無いと「鳴ると分かってから
 * 消す」しかできない。設定ごとに見た目を変えない（同じ形で並べる）。
 *
 * **トグルスイッチで出す。** 「音入/音切」のラベル差し替えは、いまどちらの
 * 状態か一目で読めない。軌道とつまみの位置＋ON/OFF表記で状態を示す。
 * **全体の幅は常に同じにする。** ON/OFF の文字数差でボタンが伸縮すると、
 * クリックのたびに指標が揺れる。状態表記は固定幅で出す。
 */
export function SettingToggle({
  label,
  ariaLabel,
  on,
  onToggle,
}: {
  /** スイッチの横に出す短い名前（「音」） */
  label: string;
  /** 読み上げ用の名前（「効果音」） */
  ariaLabel: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      aria-label={ariaLabel}
      className="flex items-center gap-2 rounded-full border border-kinari/15 px-3 py-1.5 text-xs tracking-widest text-kinari/60 transition-colors hover:border-kin hover:text-kinari"
    >
      {label}
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
      <span
        className={`inline-block w-8 text-center font-mono ${on ? "text-kinari" : "text-kinari/40"}`}
      >
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
