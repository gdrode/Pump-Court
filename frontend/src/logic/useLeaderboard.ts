import { useCallback, useEffect, useState } from "react";
import { backend, errorText } from "../api/backend";
import type { LeaderboardRow, TeamRow } from "../api/types";
import { fetchBoard, type BoardRef } from "./useEvents";

/** Operator leaderboard: one board at a time (global, event or team), moderation and backups. */
export function useLeaderboard(initial: BoardRef = { kind: "global", mode: null }, limit = 50) {
  const [board, setBoard] = useState<BoardRef>(initial);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchBoard(board, limit)
      .then((r) => {
        setRows(r.players);
        setTeams(r.teams);
      })
      .catch((e) => setMessage(errorText(e)));
  }, [board, limit]);
  useEffect(reload, [reload]);

  return {
    board,
    setBoard,
    /** Player rows (global and event boards). */
    rows,
    /** Team rows (team boards). */
    teams,
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
