import type { RepVerdict } from "../../api/types";
import { REF_COMPARATOR, REFEREE_LABELS, REFEREES } from "../../config/modes";

interface Props {
  /** The last judged rep, or null before the first one. */
  rep: RepVerdict | null;
  /** Bumps on every new rep so the lights re-flash even with identical calls. */
  flashKey?: number;
  size?: "lg" | "xl";
  showEvidence?: boolean;
}

/** The referee lights, one per referee. White = pass, red = no-rep for that rule, empty = waiting. */
export function Lights({ rep, flashKey, size = "lg", showEvidence = true }: Props) {
  return (
    <div className={`lights lights--${size}`} key={flashKey}>
      {REFEREES.map((ref) => {
        const c = rep?.lights.find((l) => l.referee === ref);
        const state = !c ? "off" : c.pass ? "white" : "red";
        return (
          <div className="light" key={ref}>
            <div
              className={`light__lamp sketch light__lamp--${state}`}
              aria-label={`${REFEREE_LABELS[ref]}: ${state === "white" ? "pass" : state === "red" ? "no rep" : "waiting"}`}
            />
            <div className="light__label">{REFEREE_LABELS[ref]}</div>
            {showEvidence && c && !c.pass && (
              <div className="light__evidence">
                {Math.round(c.measured)}°{" "}
                <span>
                  needs {REF_COMPARATOR[ref]}
                  {Math.round(c.needed)}°
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
