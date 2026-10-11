import { useCallback, useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { LeaderboardRow } from "../api/types";
import { useBackendEvent } from "./events";

/**
 * The top 3 on the all-time global board, for the home screen's trophy shelf.
 * Reloads when a score is posted or the global boards are reset.
 */
export function useTopThree(): LeaderboardRow[] {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const refresh = useCallback(() => {
    backend
      .getLeaderboard(null, 3)
      .then((r) => setRows(r.slice(0, 3)))
      .catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);
  useBackendEvent(events.onRoundPosted, refresh);
  useBackendEvent(events.onLeaderboardReset, refresh);
  return rows;
}
