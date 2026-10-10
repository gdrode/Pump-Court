import { useEffect, useRef } from "react";
import { useTracker } from "../../logic/tracker/TrackerProvider";

/**
 * The live camera with the tracked side's skeleton drawn on top. The video
 * itself belongs to the tracker; this just gives it a place on screen.
 * `rotatable` shows Rotate / auto, for a phone propped on its side.
 */
export function CameraView({ className = "", rotatable = false }: { className?: string; rotatable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { attach, cameraError, modelStatus, rotation, rotationAuto, rotate, rotateAuto } = useTracker();
  useEffect(() => attach(ref.current!), [attach]);
  const problem = cameraError ?? modelStatus.error ?? (modelStatus.ready ? null : "Loading tracking…");
  return (
    <div className={`camera-view ${className}`}>
      <div className="camera-view__media" ref={ref} />
      {problem && <div className="camera-view__note sketch">{problem}</div>}
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
