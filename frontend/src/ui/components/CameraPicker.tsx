import { useState } from "react";
import { useTracker } from "../../logic/tracker/TrackerProvider";
import { AddCameraDialog } from "./AddCameraDialog";

/**
 * Which camera films this player, and "+ Add camera" to pair a phone (or find
 * a USB camera). Uses the tracker of the slot it sits in (TrackerSlot).
 */
export function CameraPicker({ label, emptyLabel = "Default camera" }: { label: string; emptyLabel?: string }) {
  const tracker = useTracker();
  const [adding, setAdding] = useState(false);
  return (
    <div className="camera-pick">
      <select
        className="sketch"
        value={tracker.current ?? ""}
        onChange={(e) => e.target.value && tracker.choose(e.target.value)}
        aria-label={label}
      >
        <option value="">{emptyLabel}</option>
        {tracker.cameras.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
            {c.note ? ` (${c.note})` : ""}
          </option>
        ))}
      </select>
      <button type="button" className="sketch" onClick={() => setAdding(true)}>
        + Add camera
      </button>
      {adding && <AddCameraDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
