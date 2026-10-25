/**
 * 打鍵音・ミス音と、1問打ち終えたときの完了音（テーマ＝ドロン、最適化＝手裏剣）。
 *
 * **音源ファイルを持たず、Web Audio API で合成する。** 読み込み待ちが無く
 * （1打目から鳴る）、Workerに載せる資産も増えない。世界観に合わせて、打鍵は
 * 短く硬い音、ミスは鈍く低い音にしてある。
 *
 * **鳴らすかどうかはここで決めない。** 消音の状態は画面が持ち、消音中は
 * `playHit()` / `playMiss()` を呼ばない。ここに状態を持つと、テストからも
 * 画面からも同じ値を2か所で見ることになる。
 */

/** 消音の設定。**匿名ユーザーのデータをサーバーに持たない**（不変条件10） */
const MUTED_KEY = "henge:muted";

/** localStorage が使えない環境（プライベートウィンドウ等）でも落とさない */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 既定は「鳴る」。読めなければ鳴る側に倒す */
export function readMuted(): boolean {
  return storage()?.getItem(MUTED_KEY) === "1";
}

export function writeMuted(muted: boolean): void {
  try {
    storage()?.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // 容量超過・書き込み禁止。次に開いたとき既定に戻るだけで、プレイは続けられる
  }
}

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audioContext(): AudioContext | null {
  if (context !== null) return context;
  const Ctor = globalThis.AudioContext;
  if (Ctor === undefined) return null;
  context = new Ctor();
  return context;
}

/**
 * 音を出せる状態にする。**ユーザー操作の中から呼ぶこと**（開始の Space）。
 * ブラウザは操作を伴わずに作られた AudioContext を止めたままにする。
 */
export function primeAudio(): void {
  const ctx = audioContext();
  if (ctx !== null && ctx.state === "suspended") void ctx.resume();
}

/** 白色雑音。打鍵の「カチッ」を作る材料。1度作って使い回す */
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer !== null) return noiseBuffer;
  const frames = Math.floor(ctx.sampleRate * 0.2);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/**
 * 減衰する音量。**0から指数で上げない**（`exponentialRamp` は0を扱えないので、
 * ほぼ0の値から立ち上げて、ほぼ0へ落とす）。
 */
function envelope(
  ctx: AudioContext,
  peak: number,
  attack: number,
  release: number,
  // 遅らせて鳴らす層（手裏剣の「刺さる」）は、開始時刻をずらして組む
  now = ctx.currentTime,
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
  return gain;
}

/**
 * 打鍵音の作り。**拍子木（木と木を打ち合わせる音）を目指す。**
 *
 * 三味線でいう撥音のような、単一の正弦波だけの音は電子音に聞こえる。木の音は
 * 3つの層でできているので、そのまま3層で組む。
 *
 * | 層 | 役割 | 作り方 |
 * |---|---|---|
 * | あたり | 押した瞬間の輪郭。ここが遅れると「重い」と感じる | 雑音の一瞬（10ms）を高い帯域で抜く |
 * | 鳴り | 木らしさ。ここだけで音色が決まる | 雑音を**高いQの帯域**で細く残す |
 * | 胴 | 手応え（重み） | 低い三角波を短く鳴らす |
 */
interface Clack {
  /** あたりの帯域と音量 */
  tickHz: number;
  tickGain: number;
  /** 鳴りの帯域・鋭さ・音量・長さ */
  ringHz: number;
  ringQ: number;
  ringGain: number;
  ringRelease: number;
  /** 胴の高さと音量 */
  bodyHz: number;
  bodyGain: number;
}

/**
 * 打鍵音の設定。**全体を短く保つ**（合計 60ms 程度）。
 * 長くすると、速く打ったときに前の音が残って濁る。
 */
const HIT: Clack = {
  tickHz: 3400,
  tickGain: 0.05,
  ringHz: 1150,
  ringQ: 9,
  ringGain: 0.9,
  ringRelease: 0.045,
  bodyHz: 210,
  bodyGain: 0.05,
};

/**
 * 木を打つ音を1つ鳴らす。
 *
 * **1打ごとに高さと音量を少しずらす。** まったく同じ音が並ぶと、打鍵ではなく
 * 機械の警告音に聞こえる。実際のキーボードも1打ごとに違う音が鳴っている。
 */
function clack(ctx: AudioContext, spec: Clack, now = ctx.currentTime): void {
  const detune = 1 + (Math.random() - 0.5) * 0.12;
  const level = 0.88 + Math.random() * 0.24;
  // 雑音は毎回違うところから読む。同じ波形を鳴らすと「同じ音」に聞こえる
  const offset = Math.random() * 0.15;

  const tick = ctx.createBufferSource();
  tick.buffer = noise(ctx);
  const tickBand = ctx.createBiquadFilter();
  tickBand.type = "bandpass";
  tickBand.frequency.value = spec.tickHz * detune;
  tickBand.Q.value = 1.2;
  const tickGain = envelope(ctx, spec.tickGain * level, 0.001, 0.01, now);
  tick.connect(tickBand).connect(tickGain).connect(ctx.destination);
  tick.start(now, offset);
  tick.stop(now + 0.02);

  const ring = ctx.createBufferSource();
  ring.buffer = noise(ctx);
  const ringBand = ctx.createBiquadFilter();
  ringBand.type = "bandpass";
  ringBand.frequency.value = spec.ringHz * detune;
  ringBand.Q.value = spec.ringQ;
  const ringGain = envelope(ctx, spec.ringGain * level, 0.002, spec.ringRelease, now);
  ring.connect(ringBand).connect(ringGain).connect(ctx.destination);
  ring.start(now, offset);
  ring.stop(now + spec.ringRelease + 0.02);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(spec.bodyHz * detune, now);
  body.frequency.exponentialRampToValueAtTime(spec.bodyHz * 0.72, now + 0.05);
  const bodyGain = envelope(ctx, spec.bodyGain * level, 0.002, 0.05, now);
  body.connect(bodyGain).connect(ctx.destination);
  body.start(now);
  body.stop(now + 0.08);
}

/** 打鍵音。短い木の音。長く鳴らすと連打で音が積み上がって濁る */
export function playHit(): void {
  const ctx = audioContext();
  if (ctx === null) return;
  clack(ctx, HIT);
}

/** ミス音。鈍く低い音。**打鍵音より長く、音程を下げる**（外したと分かる） */
export function playMiss(): void {
  const ctx = audioContext();
  if (ctx === null) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(190, now);
  osc.frequency.exponentialRampToValueAtTime(82, now + 0.18);
  const tone = envelope(ctx, 0.13, 0.006, 0.2);
  osc.connect(tone).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);

  const thud = ctx.createBufferSource();
  thud.buffer = noise(ctx);
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 420;
  const thudGain = envelope(ctx, 0.06, 0.004, 0.07);
  thud.connect(low).connect(thudGain).connect(ctx.destination);
  thud.start(now);
  thud.stop(now + 0.1);
}

/**
 * 鈴の音を1つ鳴らす。**倍音を整数倍にしない**（整数倍だと電子音の和音に聞こえる）。
 * 金属の鳴りは基音に対して約2.3倍の上音が強く出るので、それを小さく重ねる。
 */
function bell(ctx: AudioContext, hz: number, peak: number, at: number): void {
  for (const [ratio, gain] of [
    [1, 1],
    [2.32, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz * ratio, at);
    const env = envelope(ctx, peak * gain, 0.003, 0.9 / ratio, at);
    osc.connect(env).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 1);
  }
}

/**
 * テーマの完了音。忍術の「ドロン」。**打ち終えた瞬間に煙が噴き出し（ボフッ）、鈴が鳴る（チリン）。**
 * 紹介動画の演出に合わせてある。**頭に待ち時間を置かない**（演出の煙も打ち終えた瞬間に
 * 噴き出す。遅らせると、次のお題が見えてから鳴っているように聞こえる）。
 *
 * - 鈴: 高い音を2つ、わずかにずらして鳴らす（約2.9kHz → 4kHz）。煙の上に乗せる
 * - ド: 三角波を低く落とす。打鍵音の胴より低く長い（区切りだと分かる重さ）
 * - 煙: 雑音を低域通過に通し、通す帯域を高 → 低へ下げる。煙が広がって
 *   薄まっていく見立てで、明るい「ぼわっ」から暗く消える
 *
 * 全体で0.6秒ほど（鈴の余韻を除く）。1問ごとにしか鳴らないので、打鍵音のように
 * 短く詰める必要は無い。ただし**次の問題の1打目と重なっても濁らない**よう、
 * 鈴は小さく、煙は低い帯域へ逃がす（打鍵音の鳴りは1kHz前後）。
 */
export function playDoron(): void {
  const ctx = audioContext();
  if (ctx === null) return;
  const now = ctx.currentTime;

  bell(ctx, 2900, 0.035, now);
  bell(ctx, 4000, 0.025, now + 0.05);

  const don = ctx.createOscillator();
  don.type = "triangle";
  don.frequency.setValueAtTime(150, now);
  don.frequency.exponentialRampToValueAtTime(52, now + 0.22);
  const donGain = envelope(ctx, 0.22, 0.004, 0.26, now);
  don.connect(donGain).connect(ctx.destination);
  don.start(now);
  don.stop(now + 0.3);

  const smoke = ctx.createBufferSource();
  smoke.buffer = noise(ctx);
  // 雑音の材料は0.2秒しか無いので、繰り返して煙の長さを作る
  smoke.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.Q.value = 2;
  low.frequency.setValueAtTime(2600, now);
  low.frequency.exponentialRampToValueAtTime(260, now + 0.46);
  const smokeGain = envelope(ctx, 0.32, 0.015, 0.45, now);
  smoke.connect(low).connect(smokeGain).connect(ctx.destination);
  smoke.start(now, Math.random() * 0.15);
  smoke.stop(now + 0.5);
}

/**
 * 手裏剣が的に届くまで（秒）。演出の飛ぶ長さ（`.strike__shuriken`）と揃える。
 * **短く保つ。** 打ち終えてから刺さるまでが長いと、刺さる前に次のお題が見えてしまう
 */
const STRIKE_AT = 0.08;

/** 刺さる音。打鍵音より低く太く、板の鳴りを長めに残す */
const BOARD: Clack = {
  tickHz: 2600,
  tickGain: 0.18,
  ringHz: 620,
  ringQ: 7,
  ringGain: 1.3,
  ringRelease: 0.09,
  bodyHz: 140,
  bodyGain: 0.2,
};

/**
 * 最適化練習の完了音。手裏剣が**飛んで（シュッ）、的に刺さる（タンッ）。**
 *
 * - 風切り: 雑音の狭い帯域を低 → 高へ上げながら大きくする（近づいてくる）
 * - 刺さる: 打鍵音と同じ木の3層（`clack`）を、木の板らしく低めに太く鳴らす。
 *   金属の刃が刺さるので、高い正弦波の「キン」をごく小さく重ねる
 *
 * 刺さる瞬間は、演出（`ShurikenStrike`）で手裏剣が的に届く時刻に揃える（`STRIKE_AT`）。
 */
export function playStrike(): void {
  const ctx = audioContext();
  if (ctx === null) return;
  const now = ctx.currentTime;

  const whoosh = ctx.createBufferSource();
  whoosh.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 2.5;
  band.frequency.setValueAtTime(900, now);
  band.frequency.exponentialRampToValueAtTime(4800, now + STRIKE_AT);
  const whooshGain = ctx.createGain();
  whooshGain.gain.setValueAtTime(0.0001, now);
  whooshGain.gain.exponentialRampToValueAtTime(0.16, now + STRIKE_AT - 0.01);
  whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + STRIKE_AT + 0.02);
  whoosh.connect(band).connect(whooshGain).connect(ctx.destination);
  whoosh.start(now, Math.random() * 0.05);
  whoosh.stop(now + STRIKE_AT + 0.04);

  const hitAt = now + STRIKE_AT;
  clack(ctx, BOARD, hitAt);

  const kin = ctx.createOscillator();
  kin.type = "sine";
  kin.frequency.setValueAtTime(3300, hitAt);
  const kinGain = envelope(ctx, 0.03, 0.002, 0.16, hitAt);
  kin.connect(kinGain).connect(ctx.destination);
  kin.start(hitAt);
  kin.stop(hitAt + 0.2);
}
