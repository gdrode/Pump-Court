import type { CrowdView } from "../../api/types";
import { CROWD_PAGES } from "../../config/modes";
import { useCrowdControl } from "../../logic/useCrowdControl";

/** Operator buttons: what the crowd screen shows between rounds. */
export function CrowdViewPicker() {
  const crowd = useCrowdControl();
  const options: { label: string; view: CrowdView }[] = [
    { label: "Cycle all", view: { kind: "auto" } },
    ...CROWD_PAGES.map((p) => ({
      label: p.title,
      view: (p.kind === "board" ? { kind: "board", category: p.category } : { kind: "recent" }) as CrowdView,
    })),
  ];
  return (
    <div className="crowd-picker">
      <span>Crowd screen shows</span>
      <div className="seg" role="group" aria-label="Crowd screen view">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={`seg__btn sketch ${crowd.isActive(o.view) ? "is-on" : ""}`}
            onClick={() => crowd.setView(o.view)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
