import { useEffect, useRef } from "react";
import type { Tick } from "../api/types";

// Bones to draw, as pairs of MediaPipe landmark indices.
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

/** Camera preview (when the tracker sends one) with the skeleton drawn on top. */
export function PoseView({ tick }: { tick: Tick | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Keep the latest preview image decoded; previews arrive less often than ticks.
  useEffect(() => {
    if (!tick?.preview) return;
    const img = new Image();
    img.onload = () => (imageRef.current = img);
    img.src = tick.preview;
  }, [tick?.preview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tick) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = tick.width;
    canvas.height = tick.height;
    const { width: w, height: h } = canvas;

    if (imageRef.current) ctx.drawImage(imageRef.current, 0, 0, w, h);
    else {
      ctx.fillStyle = "#111318";
      ctx.fillRect(0, 0, w, h);
    }
    const lms = tick.landmarks;
    if (!lms) return;

    const ok = tick.session.trackingOk;
    ctx.lineWidth = Math.max(4, w / 200);
    ctx.strokeStyle = ok ? "rgba(255,255,255,0.9)" : "rgba(255,90,90,0.9)";
    for (const [a, b] of BONES) {
      if (lms[a].visibility < 0.3 || lms[b].visibility < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(lms[a].x * w, lms[a].y * h);
      ctx.lineTo(lms[b].x * w, lms[b].y * h);
      ctx.stroke();
    }
    ctx.fillStyle = "#4ade80";
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      if (lms[i].visibility < 0.3) continue;
      ctx.beginPath();
      ctx.arc(lms[i].x * w, lms[i].y * h, ctx.lineWidth * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Live angle labels next to the joints on the near side.
    const angles = tick.angles;
    if (angles) {
      const near = angles.side === "left" ? { elbow: 13, hip: 23, knee: 25 } : { elbow: 14, hip: 24, knee: 26 };
      ctx.font = `bold ${Math.round(w / 45)}px system-ui`;
      ctx.fillStyle = "#facc15";
      for (const joint of ["elbow", "hip", "knee"] as const) {
        const p = lms[near[joint]];
        ctx.fillText(`${Math.round(angles[joint])}°`, p.x * w + 12, p.y * h - 12);
      }
    }
  }, [tick]);

  return <canvas ref={canvasRef} className="pose-view" />;
}
