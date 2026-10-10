import type { Tick } from "../api/types";

/** Live numbers for practice / tuning. */
export function AnglePanel({ tick }: { tick: Tick | null }) {
  const a = tick?.angles;
  return (
    <div className="angle-panel">
      <div>Elbow <b>{a ? Math.round(a.elbow) : "–"}°</b></div>
      <div>Hip <b>{a ? Math.round(a.hip) : "–"}°</b></div>
      <div>Knee <b>{a ? Math.round(a.knee) : "–"}°</b></div>
      <div>FPS <b>{tick ? Math.round(tick.fps) : "–"}</b></div>
      {tick?.session.lockoutThreshold != null && (
        <div>Lockout ≥ <b>{Math.round(tick.session.lockoutThreshold)}°</b></div>
      )}
    </div>
  );
}
