import { useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { CrowdView } from "../api/types";
import { useBackendEvent } from "./events";

/** Operator control for what the crowd screen shows between rounds. */
export function useCrowdControl() {
  const [view, setView] = useState<CrowdView>({ kind: "auto" });
  useEffect(() => {
    backend.getCrowdView().then(setView);
  }, []);
  useBackendEvent(events.onCrowdView, setView);

  return {
    view,
    setView: (v: CrowdView) => backend.setCrowdView(v),
    isActive: (v: CrowdView) => JSON.stringify(v) === JSON.stringify(view),
    openWindow: () => backend.openCrowdWindow(),
  };
}
