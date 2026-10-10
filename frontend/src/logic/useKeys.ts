import { useEffect, useRef } from "react";

/**
 * Keyboard shortcuts for a screen: `useKeys({ "1": pickSprint, Escape: back })`.
 * Keys are matched case-insensitively. A handled key's default is prevented,
 * so it doesn't also type into an input on the next screen.
 */
export function useKeys(bindings: Record<string, (() => void) | undefined>) {
  const latest = useRef(bindings);
  latest.current = bindings;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      // While typing, only Enter/Escape count as shortcuts.
      if (typing && e.key !== "Escape" && e.key !== "Enter") return;
      const key = Object.keys(latest.current).find((k) => k.toLowerCase() === e.key.toLowerCase());
      const handler = key && latest.current[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
