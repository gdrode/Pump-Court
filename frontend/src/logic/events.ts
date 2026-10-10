import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { events } from "../api/backend";
import type { Tick } from "../api/types";

/** Subscribes to a backend event for the lifetime of the component. */
export function useBackendEvent<T>(
  subscribe: (cb: (payload: T) => void) => Promise<UnlistenFn>,
  handler: (payload: T) => void,
) {
  // Always call the latest handler without resubscribing.
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    subscribe((p) => latest.current(p)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [subscribe]);
}

/** The most recent frame from the engine (skeleton, angles, round state). */
export function useTick(): Tick | null {
  const [tick, setTick] = useState<Tick | null>(null);
  useBackendEvent(events.onTick, setTick);
  return tick;
}
