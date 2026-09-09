/**
 * 効果音の入/切。**プレイ中と開始前の両方に出す。**
 *
 * 打ち始めてから消したくなることもあれば、始める前に消したいこともある。
 * 開始前にしか無いと打鍵中は消せず、プレイ中にしか無いと「鳴ると分かってから
 * 消す」しかできない。
 */
export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted}
      aria-label={muted ? "効果音を鳴らす" : "効果音を止める"}
      className="rounded-full border border-kinari/15 px-4 py-1 text-xs tracking-widest text-kinari/50 transition-colors hover:border-kin hover:text-kinari"
    >
      音<span className="ml-2 font-mono text-kinari/40">{muted ? "切" : "入"}</span>
    </button>
  );
}
