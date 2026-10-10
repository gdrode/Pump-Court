import type { RepVerdict } from "../../api/types";
import { REFEREE_LABELS } from "../../config/modes";

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
            <span>{REFEREE_LABELS[ref]}</span>
          </div>
        );
      })}
    </div>
  );
}
