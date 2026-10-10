import { useState } from "react";
import { backend, errorText } from "../api/backend";
import { NAME_MAX, type MenuModeInfo } from "../config/modes";

/** Keeps letters, digits, spaces and . _ - ; collapses spaces; max length. */
export function cleanName(raw: string) {
  return raw.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trimStart().slice(0, NAME_MAX);
}

/**
 * Names for one player, or exactly two for a Duel. The backend has the final
 * say on each name (length and blocklist), so the same rules apply everywhere.
 */
export function useNameEntry(mode: MenuModeInfo, onStart: (players: string[]) => void) {
  const [names, setNames] = useState<string[]>(Array(mode.players).fill(""));
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const multi = mode.players > 1;

  const start = async () => {
    const all = names.map((n) => n.trim());
    const empty = all.findIndex((n) => !n);
    if (empty >= 0) {
      setActive(empty);
      return setError(multi ? `Player ${empty + 1} needs a name` : "Type a name first");
    }
    if (new Set(all.map((n) => n.toLowerCase())).size !== all.length) return setError("The two players need different names");
    for (let i = 0; i < all.length; i++) {
      try {
        all[i] = await backend.checkName(all[i]);
      } catch (err) {
        setActive(i);
        return setError(errorText(err));
      }
    }
    onStart(all);
  };

  return {
    names,
    multi,
    active,
    setActive,
    error,
    maxLength: NAME_MAX,
    setName: (index: number, value: string) => {
      setError(null);
      setNames((ns) => ns.map((old, i) => (i === index ? cleanName(value) : old)));
    },
    /** Enter: jump to the next empty name, or start once everyone has one. */
    enter: () => {
      if (!names[active]?.trim()) return setError(multi ? `Player ${active + 1} needs a name` : "Type a name first");
      const nextEmpty = names.findIndex((n, i) => i !== active && !n.trim());
      if (nextEmpty >= 0) return setActive(nextEmpty);
      void start();
    },
    start,
  };
}
