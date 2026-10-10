import { useState } from "react";
import { backend, errorText } from "../api/backend";
import type { MenuModeInfo } from "../config/modes";

/** Name entry for one or two players. Name rules live in the backend. */
export function useNameEntry(mode: MenuModeInfo, onStart: (players: string[], isTeam: boolean) => void) {
  const [names, setNames] = useState<string[]>(Array(mode.players).fill(""));
  const [isTeam, setIsTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    names,
    setName: (index: number, value: string) => {
      setNames((n) => n.map((old, i) => (i === index ? value : old)));
      setError(null);
    },
    isTeam,
    setIsTeam,
    error,
    maxLength: 12,
    submit: async () => {
      try {
        const cleaned = await Promise.all(names.map((n) => backend.checkName(n)));
        onStart(cleaned, isTeam);
      } catch (err) {
        setError(errorText(err));
      }
    },
  };
}
