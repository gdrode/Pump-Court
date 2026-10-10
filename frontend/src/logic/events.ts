import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { events } from "../api/backend";
import type { SessionSnapshot } from "../api/types";

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

/** The round as the backend last reported it (null until the first `tick`). */
export function useSession(): SessionSnapshot | null {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  useBackendEvent(events.onTick, setSession);
  return session;
}
