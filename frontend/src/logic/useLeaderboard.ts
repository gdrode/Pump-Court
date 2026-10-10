import { useCallback, useEffect, useState } from "react";
import { backend, errorText } from "../api/backend";
import type { Category, LeaderboardRow } from "../api/types";

/** Operator leaderboard: tabs, moderation and backups. */
export function useLeaderboard(initial: Category = "thirtySecond", limit = 50) {
  const [category, setCategory] = useState<Category>(initial);
  const [includeTeam, setIncludeTeam] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    backend.getLeaderboard(category, includeTeam, limit).then(setRows).catch((e) => setMessage(errorText(e)));
  }, [category, includeTeam, limit]);
  useEffect(reload, [reload]);

  return {
    category,
    setCategory,
    includeTeam,
    setIncludeTeam,
    rows,
    message,
    reload,
    /** Delete one run (the UI should confirm first). */
    remove: async (row: LeaderboardRow) => {
      await backend.deleteRun(row.runId);
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
