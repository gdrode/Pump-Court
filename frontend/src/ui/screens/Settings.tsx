import { POSTURE_MESSAGE } from "@tracker/posture";
import { useState } from "react";
import { useKeys } from "../../logic/useKeys";
import { useTracker } from "../../logic/tracker/TrackerProvider";
import { AddCameraDialog } from "../components/AddCameraDialog";
import { CameraView } from "../components/CameraView";
import { KeyHints } from "../components/KeyHints";

/** Camera screen: pick a camera, pair a phone, check the player is tracked. The referee rules are fixed. */
export function Settings({ onBack }: { onBack: () => void }) {
  const tracker = useTracker();
  const [adding, setAdding] = useState(false);
  useKeys({ Escape: onBack, a: () => setAdding(true) }, !adding);
  const posture = tracker.live.posture;

  return (
    <div className="camera-settings">
      <div className="camera-settings__view">
        <CameraView rotatable />
      </div>
      <aside className="side-panel sketch settings">
        <p className="eyebrow">Operator</p>
        <h1>Camera</h1>
        <ul className="camera-list">
          {tracker.cameras.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className={`seg__btn sketch ${c.key === tracker.current ? "is-on" : ""}`}
                onClick={() => tracker.choose(c.key)}
              >
                {c.label}
                {c.note && <small> ({c.note})</small>}
              </button>
              {c.key.startsWith("phone:") && (
                <button type="button" className="player__remove" aria-label={`Remove ${c.label}`} onClick={() => tracker.removePhone(c.key.slice(6))}>
                  ×
                </button>
              )}
            </li>
          ))}
          {tracker.cameras.length === 0 && <li className="muted">No cameras found yet.</li>}
        </ul>
        <button type="button" className="add-player sketch" onClick={() => setAdding(true)}>
          + Add camera (phone, USB) <kbd>A</kbd>
        </button>

        <dl className="tracking">
          <dt>Tracking</dt>
          <dd>
            {tracker.modelStatus.error ??
              (tracker.modelStatus.ready
                ? `ready (${tracker.modelStatus.delegate}), ${Math.round(tracker.live.poseFps)} poses/s`
                : "loading…")}
          </dd>
          <dt>Player</dt>
          <dd>{posture ? POSTURE_MESSAGE[posture.state] : "—"}</dd>
        </dl>
        <p className="muted">
          Put the camera side-on to the mat, about knee height, with the whole body in view. Rules are fixed: a push-up counts with 2 of 3 white
          lights (Depth, Torso, Lockout), and Depth must be one of them.
        </p>
        <KeyHints hints={[["Esc", "Back", onBack]]} />
      </aside>
      {adding && <AddCameraDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
