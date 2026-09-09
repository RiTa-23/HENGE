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

/** 打鍵音。硬く短い「カチッ」。長く鳴らすと連打で音が積み上がって濁る */
export function playHit(): void {
  const ctx = audioContext();
  if (ctx === null) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1700, now);
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.04);
  const tone = envelope(ctx, 0.07, 0.004, 0.05);
  osc.connect(tone).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);

  // 雑音を薄く重ねる。純粋な正弦波だけだと電子音に聞こえて硬さが出ない
  const click = ctx.createBufferSource();
  click.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2600;
  const clickGain = envelope(ctx, 0.05, 0.002, 0.018);
  click.connect(band).connect(clickGain).connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.03);
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
