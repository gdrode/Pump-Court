import { useEffect, useState } from "react";
import { backend } from "../api/backend";
import type { RoundMode } from "../api/types";

/** The top score on one mode's board, to show as "Record" during a round. Null skips the lookup. */
export function useBoardRecord(mode: RoundMode | null) {
  const [record, setRecord] = useState<{ name: string; points: number } | null>(null);
  useEffect(() => {
    if (!mode) return setRecord(null);
    let alive = true;
    backend
      .getLeaderboard(mode, 1)
      .then((rows) => alive && setRecord(rows[0] ? { name: rows[0].name, points: rows[0].points } : null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);
  return record;
}
