import { useCallback, useEffect, useState } from "react";
import { backend, errorText } from "../api/backend";
import type { LeaderboardRow, RoundMode } from "../api/types";

/** Operator leaderboard: tabs (all time or one mode), moderation and backups. */
export function useLeaderboard(initial: RoundMode | null = null, limit = 50) {
  const [mode, setMode] = useState<RoundMode | null>(initial);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    backend.getLeaderboard(mode, limit).then(setRows).catch((e) => setMessage(errorText(e)));
  }, [mode, limit]);
  useEffect(reload, [reload]);

  return {
    mode,
    setMode,
    rows,
    message,
    reload,
    /** Delete one run (the UI should confirm first). */
    remove: async (row: LeaderboardRow) => {
      try {
        await backend.deleteRun(row.runId);
      } catch (e) {
        setMessage(errorText(e));
      }
      reload();
    },
    exportBackup: async () => {
      try {
        setMessage(`Backup written to ${await backend.exportBackup()}`);
      } catch (e) {
        setMessage(errorText(e));
      }
    },
  };
}
