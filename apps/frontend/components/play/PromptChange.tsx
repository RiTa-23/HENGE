import { SHURIKEN_PATH } from "./Shuriken";
import "./ninja.css";

/**
 * お題が切り替わる瞬間の演出。**載せる物体と同じくモードで分ける**
 * （テーマ＝巻物から煙、最適化練習＝的板に手裏剣）。紹介動画の演出に合わせてある。
 *
 * - 呼び出し側が `key` に問題番号を渡して**切り替わるたびに作り直す。** CSSの
 *   アニメーションは1度だけ走り、終わったら透明のまま残る（次の切り替わりで消える）
 * - **打鍵を妨げない。** `pointer-events: none` で重ねるだけで、計時も止めない。
 *   お題を隠す時間は短く（0.6秒ほど）、文字の上にはごく短くしか被らない
 * - 視差効果を減らす設定では出さない（ninja.css）。音は鳴る
 *
 * 音（`playDoron` / `playStrike`）とは時刻を揃えてある。煙が噴き出す・手裏剣が
 * 刺さる瞬間の数値を変えるときは `lib/play/sound.ts` の側も合わせる。
 */

/** テーマ: 巻物の左寄りから煙が噴き出し、右へ流れながら薄れる。晴れると次のお題 */
export function SmokePuff() {
  return (
    <div className="prompt-fx" aria-hidden="true">
      {/* 打ち終えた合図。紙の下の縁に金の線が一瞬走る */}
      <span className="smoke__line" />
      <span className="smoke__puff">
        {/* 大きさの違う玉を重ねて、ひとかたまりの煙の凹凸を作る。1つの円だと光の玉に見える */}
        <span className="smoke__ball" style={{ "--x": "0%", "--y": "0%", "--s": "1" } as Style} />
        <span
          className="smoke__ball"
          style={{ "--x": "-38%", "--y": "18%", "--s": "0.72" } as Style}
        />
        <span
          className="smoke__ball"
          style={{ "--x": "34%", "--y": "-16%", "--s": "0.78" } as Style}
        />
        <span
          className="smoke__ball"
          style={{ "--x": "20%", "--y": "30%", "--s": "0.6" } as Style}
        />
      </span>
    </div>
  );
}

/**
 * 火花の向き（度）。**等間隔にしない。** 揃っていると光の記号（きらめき）に見える。
 * 長さも1本ずつ変える
 */
const SPARKS = [
  { angle: 8, length: 1 },
  { angle: 52, length: 0.7 },
  { angle: 97, length: 0.9 },
  { angle: 141, length: 0.65 },
  { angle: 183, length: 1 },
  { angle: 226, length: 0.75 },
  { angle: 268, length: 0.95 },
  { angle: 317, length: 0.7 },
];

/**
 * 最適化練習: 手裏剣が回りながら飛んできて、的の中心に刺さる。刺さった瞬間に
 * 朱の輪が広がり、金の火花が散る（紹介動画で苦無が的に刺さる場面と同じ作り）。
 * 刺さった手裏剣は少しのあいだ残ってから消える（読みの行の真上に来るため）。
 */
export function ShurikenStrike() {
  return (
    // 板の外へ出た分は切る。手裏剣は板の縁から飛び込んでくるように見える
    <div className="prompt-fx prompt-fx--clip" aria-hidden="true">
      <span className="strike__ring" />
      {SPARKS.map(({ angle, length }) => (
        <span
          key={angle}
          className="strike__spark"
          style={{ "--a": `${angle}deg`, "--l": `${length}` } as Style}
        />
      ))}
      <svg viewBox="0 0 100 100" className="strike__shuriken">
        <path d={SHURIKEN_PATH} fill="currentColor" transform="rotate(20 50 50)" />
        <circle cx="50" cy="50" r="7" fill="var(--color-sumi)" />
      </svg>
    </div>
  );
}

/** CSSのカスタムプロパティを style に渡すための型 */
type Style = React.CSSProperties & Record<`--${string}`, string>;
