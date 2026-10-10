import { CROWD_PAGES } from "../../config/modes";
import { useCrowdControl } from "../../logic/useCrowdControl";
import type { CrowdView } from "../../api/types";

/** Operator buttons: what the crowd screen shows between rounds. */
export function CrowdViewPicker() {
  const crowd = useCrowdControl();
  const options: { label: string; view: CrowdView }[] = [
    { label: "Auto (cycle all)", view: { kind: "auto" } },
    ...CROWD_PAGES.map((p) => ({
      label: p.title,
      view: (p.kind === "board" ? { kind: "board", category: p.category } : { kind: "recent" }) as CrowdView,
    })),
  ];
  return (
    <div className="row wrap">
      <span className="muted">Crowd screen shows:</span>
      {options.map((o) => (
        <button key={o.label} className={crowd.isActive(o.view) ? "active" : ""} onClick={() => crowd.setView(o.view)}>
          {o.label}
        </button>
      ))}
      <button onClick={crowd.openWindow}>Open crowd window</button>
    </div>
  );
}
