import type { RepVerdict } from "../api/types";

const LABELS = { depth: "Depth", lockout: "Lockout", plank: "Plank" };

/** Three referee lights. White = pass, red = fail, grey = waiting. */
export function RefereeLights({ rep, big = false }: { rep: RepVerdict | null; big?: boolean }) {
  return (
    <div className={`lights ${big ? "lights-big" : ""}`}>
      {(["depth", "lockout", "plank"] as const).map((ref, i) => {
        const light = rep?.lights[i];
        const state = !light ? "idle" : light.pass ? "pass" : "fail";
        return (
          <div key={ref} className="light-wrap">
            <div className={`light light-${state}`} />
            <span>{LABELS[ref]}</span>
          </div>
        );
      })}
    </div>
  );
}
