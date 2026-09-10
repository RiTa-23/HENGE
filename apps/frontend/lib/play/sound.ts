/**
 * 打鍵音とミス音。
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
function envelope(ctx: AudioContext, peak: number, attack: number, release: number): GainNode {
  const gain = ctx.createGain();
  const now = ctx.currentTime;
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
function clack(ctx: AudioContext, spec: Clack): void {
  const now = ctx.currentTime;
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
  const tickGain = envelope(ctx, spec.tickGain * level, 0.001, 0.01);
  tick.connect(tickBand).connect(tickGain).connect(ctx.destination);
  tick.start(now, offset);
  tick.stop(now + 0.02);

  const ring = ctx.createBufferSource();
  ring.buffer = noise(ctx);
  const ringBand = ctx.createBiquadFilter();
  ringBand.type = "bandpass";
  ringBand.frequency.value = spec.ringHz * detune;
  ringBand.Q.value = spec.ringQ;
  const ringGain = envelope(ctx, spec.ringGain * level, 0.002, spec.ringRelease);
  ring.connect(ringBand).connect(ringGain).connect(ctx.destination);
  ring.start(now, offset);
  ring.stop(now + spec.ringRelease + 0.02);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(spec.bodyHz * detune, now);
  body.frequency.exponentialRampToValueAtTime(spec.bodyHz * 0.72, now + 0.05);
  const bodyGain = envelope(ctx, spec.bodyGain * level, 0.002, 0.05);
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
