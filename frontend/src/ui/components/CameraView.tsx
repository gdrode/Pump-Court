import { useEffect, useRef, useState } from "react";
import { useTracker } from "../../logic/tracker/TrackerProvider";

/**
 * The live camera with the tracked side's skeleton drawn on top. The video
 * itself belongs to the tracker; this just gives it a place on screen.
 * `rotatable` shows Rotate / auto, for a phone propped on its side.
 * Recalibrate (always there, every mode, also mid-round) is for a crowded
 * venue: it drops the person being tracked for the next best player.
 */
export function CameraView({ className = "", rotatable = false }: { className?: string; rotatable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { attach, cameraError, modelStatus, rotation, rotationAuto, rotate, rotateAuto, recalibrate } = useTracker();
  useEffect(() => attach(ref.current!), [attach]);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    if (!looking) return;
    const t = setTimeout(() => setLooking(false), 1500);
    return () => clearTimeout(t);
  }, [looking]);
  const problem = cameraError ?? modelStatus.error ?? (modelStatus.ready ? null : "Loading tracking…");
  return (
    <div className={`camera-view ${className}`}>
      <div className="camera-view__media" ref={ref} />
      {problem && <div className="camera-view__note sketch">{problem}</div>}
      <button
        type="button"
        className={`camera-view__recal sketch ${looking ? "is-on" : ""}`}
        onClick={(e) => {
          recalibrate();
          setLooking(true);
          e.currentTarget.blur(); // Enter / Space stay with the screen's own keys
        }}
        title="Tracking the wrong person? Switch to the next player: closest to the camera, on the floor in the starting position"
      >
        {looking ? "Switching player…" : "⌖ Recalibrate"}
      </button>
      {rotatable && (
        <div className="camera-view__rotate">
          <span className="sketch">
            {rotation}°{rotationAuto ? " auto" : ""}
          </span>
          <button type="button" className="sketch" onClick={rotate} title="Turn the picture 90° clockwise">
            ⟳ Rotate
          </button>
          {!rotationAuto && (
            <button type="button" className="sketch" onClick={rotateAuto} title="Use the phone's own rotation">
              auto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
