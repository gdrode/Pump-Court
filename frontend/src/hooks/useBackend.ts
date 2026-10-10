import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { events } from "../api/backend";
import type { Tick } from "../api/types";

/** Subscribes to a backend event for the lifetime of the component. */
export function useBackendEvent<T>(
  subscribe: (cb: (payload: T) => void) => Promise<UnlistenFn>,
  handler: (payload: T) => void,
) {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    subscribe(handler).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The most recent frame from the engine (skeleton, angles, round state). */
export function useTick(): Tick | null {
  const [tick, setTick] = useState<Tick | null>(null);
  useBackendEvent(events.onTick, setTick);
  return tick;
}
