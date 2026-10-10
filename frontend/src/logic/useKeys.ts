import { useEffect, useRef } from "react";

/**
 * Keyboard shortcuts for a screen: `useKeys({ "1": pickSprint, Escape: back, "Alt+n": addPlayer })`.
 *
 * Keys are `e.key` values ("1", "Enter", "ArrowUp", "l"); letters match either
 * case. Alt combinations use the physical key ("Alt+t"), because Alt changes
 * `e.key` on a Mac. While typing in a text field only Enter, Escape and Alt
 * combinations count, so typing a name never triggers shortcuts. A handled
 * key's default is prevented, so it doesn't also type into the next screen.
 */
export function useKeys(bindings: Record<string, (() => void) | undefined>, enabled = true) {
  const latest = useRef(bindings);
  latest.current = bindings;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing && e.key !== "Escape" && e.key !== "Enter" && !e.altKey) return;
      const name = e.altKey
        ? `alt+${e.code.replace(/^Key|^Digit/, "").toLowerCase()}`
        : e.key.length === 1
          ? e.key.toLowerCase()
          : e.key.toLowerCase();
      const key = Object.keys(latest.current).find((k) => k.toLowerCase() === name);
      const handler = key && latest.current[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
