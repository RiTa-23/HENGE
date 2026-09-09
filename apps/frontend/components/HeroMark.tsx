"use client";

import { useEffect, useRef, useState } from "react";

/**
 * トップのアイコンを動かす。**動かすのは朱だけ。刃は止めておく。**
 *
 * 刃も回すと動きが2つになって、ページに入った瞬間の視線がロゴに取られる。
 * 第一印象で読ませたいのはキャッチコピーの方なので、動きは1つに絞る。
 *
 * 朱は元の絵をそのまま使う。ベクターで描き直すと、かすれと飛び散った筆先が
 * 失われるため。元の弧を楕円の中心線に沿って**帯（`/logo-brush.png`）に開いて**
 * あり、ここではそれを楕円に巻き戻している。巻き戻す位置をずらせば、筆が輪の上を
 * 走る。刃に隠れて欠けていた部分は、帯の段階で隣の筆跡から埋めてある。
 *
 * **輪を回転させるのではなく、輪の上の筆を走らせる。** 平らな画像を y 軸で回すと
 * 真横を向いた瞬間に消えてしまい、奥行きにならない。
 *
 * canvas なのは、滑らかに動かすため。コマ画像を並べる方法だと、1周9秒を滑らかに
 * 見せるのに200枚以上要る。
 */

/** 元画像の座標系。この中で描いて、CSS側で縮める */
const SIZE = 512;
/** 軸穴。刃の回転軸であり、輪の中心でもある */
const HUB_X = 254;
const HUB_Y = 255.6;
/** 元の弧に当てはめた楕円。傾き・大きさとも元の絵に合わせてある */
const TILT = (-33 * Math.PI) / 180;
const RX = 223;
const RY = 82;
/** 開いた帯の寸法。幅は楕円の周長、高さは中心線から左右に振れる幅 */
const STRIP_H = 128;
/** 帯を何枚に切って貼るか。**楕円の曲率がきつい両端でも折れて見えない程度に細かく** */
const SLICES = 128;
const ORBIT_SECONDS = 9;
/** 奥ほど小さく薄く。前後が入れ替わるだけだと平面的に見える */
const DEPTH_ALPHA = 0.25;
const DEPTH_SCALE = 0.05;

/** 弧長から角度を引くための表。楕円の弧長は閉じた式で書けないので数値で持つ */
function arcTable() {
  const M = 2048;
  const phi = new Float64Array(M + 1);
  const cum = new Float64Array(M + 1);
  for (let k = 0; k <= M; k++) phi[k] = (2 * Math.PI * k) / M;
  for (let k = 1; k <= M; k++) {
    const dx = RX * (Math.cos(phi[k] as number) - Math.cos(phi[k - 1] as number));
    const dy = RY * (Math.sin(phi[k] as number) - Math.sin(phi[k - 1] as number));
    cum[k] = (cum[k - 1] as number) + Math.hypot(dx, dy);
  }
  return { phi, cum, length: cum[M] as number };
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", reject, { once: true });
    img.src = src;
  });
}

export function HeroMark({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    let frame = 0;
    let cancelled = false;

    void Promise.all([load("/logo-brush.png"), load("/logo-star.png")]).then(([strip, star]) => {
      if (cancelled) return;
      setReady(true);

      const { phi, cum, length } = arcTable();
      const stripW = strip.width;
      const slice = length / SLICES;

      /** 弧長 s の位置の角度。表を二分探索して間を線形に埋める */
      const phiAt = (s: number) => {
        const target = ((s % length) + length) % length;
        let lo = 0;
        let hi = cum.length - 1;
        while (lo + 1 < hi) {
          const mid = (lo + hi) >> 1;
          if ((cum[mid] as number) <= target) lo = mid;
          else hi = mid;
        }
        const a = cum[lo] as number;
        const b = cum[hi] as number;
        const t = (target - a) / Math.max(b - a, 1e-9);
        return (phi[lo] as number) + t * ((phi[hi] as number) - (phi[lo] as number));
      };

      const cos = Math.cos(TILT);
      const sin = Math.sin(TILT);

      const drawSlices = (offset: number, near: boolean) => {
        for (let k = 0; k < SLICES; k++) {
          const angle = phiAt((k + 0.5) * slice + offset);
          const cp = Math.cos(angle);
          const sp = Math.sin(angle);
          if (sp > 0 !== near) continue;

          const u = RX * cp;
          const v = RY * sp;
          const tangent = Math.atan2(RY * cp, -RX * sp) + TILT;
          const x = HUB_X + u * cos - v * sin;
          const y = HUB_Y + u * sin + v * cos;
          const scale = 1 + DEPTH_SCALE * sp;

          const sx = k * slice;
          const sw = Math.min(slice + 1, stripW - sx);
          ctx.save();
          ctx.globalAlpha = 1 - DEPTH_ALPHA * (1 - sp) * 0.5;
          ctx.translate(x, y);
          ctx.rotate(tangent);
          // 縦を反転する。帯を開いたときの法線の向きと、回転後の局所座標の向きが逆
          ctx.scale(scale, -scale);
          ctx.drawImage(strip, sx, 0, sw, STRIP_H, -slice / 2, -STRIP_H / 2, sw, STRIP_H);
          ctx.restore();
        }
      };

      const render = (seconds: number) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawSlices((seconds / ORBIT_SECONDS) * length, false);

        ctx.drawImage(star, 0, 0, SIZE, SIZE);

        drawSlices((seconds / ORBIT_SECONDS) * length, true);
      };

      // 視差効果を減らす設定なら、元の絵と同じ静止画を1枚描いて終わる
      if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        render(0);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        render((now - start) / 1000);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <span className={`relative block ${className ?? ""}`} aria-hidden="true">
      {/* canvas が描き始めるまでの取りこぼし。JSが動かない環境ではこれが残る */}
      {!ready && (
        <img src="/icon.png" alt="" className="absolute inset-0 h-full w-full object-contain" />
      )}
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="h-full w-full" />
    </span>
  );
}
