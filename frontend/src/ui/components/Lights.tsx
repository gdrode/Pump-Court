import type { RepVerdict } from "../../api/types";
import { REFEREE_LABELS, REFEREES } from "../../config/modes";

interface Props {
  /** The last judged rep, or null before the first one. */
  rep: RepVerdict | null;
  /** Bumps on every new rep so the lights re-flash even with identical calls. */
  flashKey?: number;
  size?: "lg" | "xl";
  /** Show why each red light was given. */
  showFaults?: boolean;
}

/** The three referee lights: Depth, Torso, Lockout. White = pass, red = fault, empty = waiting. */
export function Lights({ rep, flashKey, size = "lg", showFaults = true }: Props) {
  return (
    <div className="lights-wrap">
      <div className={`lights lights--${size}`} key={flashKey}>
        {REFEREES.map((ref) => {
          const state = !rep ? "off" : rep.lights[ref] ? "white" : "red";
          return (
            <div className="light" key={ref}>
              <div
                className={`light__lamp sketch light__lamp--${state}`}
                aria-label={`${REFEREE_LABELS[ref]}: ${state === "white" ? "pass" : state === "red" ? "fault" : "waiting"}`}
              />
              <div className="light__label">{REFEREE_LABELS[ref]}</div>
            </div>
          );
        })}
      </div>
      {showFaults && rep && rep.faults.length > 0 && (
        <ul className="lights__faults">
          {rep.faults.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
