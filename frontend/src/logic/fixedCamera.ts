// "Fixed camera" (home screen switch, key F): the venue's own camera stays in
// place for every player. When on, a round's phone camera is kept (not let go
// after the round) and every score is posted to the leaderboard straight away,
// without asking. When off (the default), each player films with their own
// phone, sees their stats on it and chooses whether to post (logic/scorePost.ts).
// Remembered on this computer.
import { useSyncExternalStore } from "react";

const KEY = "pump-court:fixed-camera";
const listeners = new Set<() => void>();

let fixed = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

/** Fixed camera is on right now (read when a round ends). */
export function isFixedCamera() {
  return fixed;
}

export function setFixedCamera(on: boolean) {
  fixed = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Not remembered; it still works for this session.
  }
  listeners.forEach((cb) => cb());
}

export function useFixedCamera(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => fixed,
  );
  return [on, setFixedCamera];
}
