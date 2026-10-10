import { useCallback, useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { LeaderboardRow, RoundResult, TeamRow } from "../api/types";
import { CROWD_BOARD_MS, CROWD_POSTED_MS, CROWD_ROWS, MODE_LABELS } from "../config/modes";
import { useBackendEvent, useSession } from "./events";
import { allEventBoards, fetchBoard, useActiveEvent, type BoardRef } from "./useEvents";

/**
 * Crowd screen data. While a round is on: the live count. Otherwise: the
 * all-time board, each player's best round in any mode; or, while an event is
 * on, the event's boards one after another (every mode, every role, the team
 * boards). A newly posted score is highlighted for a few seconds.
 */
export function useCrowd() {
  const s = useSession();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [posted, setPosted] = useState<RoundResult | null>(null);
  const [lastRepAt, setLastRepAt] = useState<number | null>(null);

  const event = useActiveEvent();
  const boards = event ? allEventBoards(event) : [];
  const [turn, setTurn] = useState(0);
  const board: BoardRef | null = boards.length ? boards[turn % boards.length] : null;
  const boardKey = board ? JSON.stringify(board) : "";
  const [eventRows, setEventRows] = useState<{ players: LeaderboardRow[]; teams: TeamRow[] }>({ players: [], teams: [] });
  const [eventTick, setEventTick] = useState(0);

  useEffect(() => {
    if (boards.length < 2) return;
    const t = setInterval(() => setTurn((n) => n + 1), CROWD_BOARD_MS);
    return () => clearInterval(t);
  }, [boards.length]);

  useEffect(() => {
    if (!board) return;
    let alive = true;
    fetchBoard(board, CROWD_ROWS)
      .then((r) => alive && setEventRows(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, eventTick]);

  const refresh = useCallback(() => {
    backend.getLeaderboard(null, CROWD_ROWS).then(setRows).catch(() => {});
    backend.getPlayerCount().then(setPlayerCount).catch(() => {});
    setEventTick((n) => n + 1);
  }, []);

  useEffect(() => {
    refresh();
    // Also catches deletes and discards made on the operator screen.
    const poll = setInterval(refresh, 10_000);
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    if (!posted) return;
    const t = setTimeout(() => setPosted(null), CROWD_POSTED_MS);
    return () => clearTimeout(t);
  }, [posted]);

  // Scores reach the board only when posted (operator or the player's phone).
  useBackendEvent(events.onRoundPosted, (r) => {
    refresh();
    setPosted(r);
  });
  useBackendEvent(events.onRep, () => setLastRepAt(performance.now()));

  const live = !!s && (s.phase === "getReady" || s.phase === "countdown" || s.phase === "running");
  // The all-time record, to beat.
  const leader = rows[0];
  return {
    /** A round is in progress: show `round`, not the board. */
    round: live
      ? {
          player: s.player ?? "",
          modeLabel: s.mode ? MODE_LABELS[s.mode] : "",
          phase: s.phase,
          countdownSeconds: s.phase === "countdown" ? Math.max(1, Math.ceil((s.countdownMs ?? 0) / 1000)) : null,
          reps: s.reps,
          attempts: s.attempts,
          elapsedMs: s.elapsedMs,
          lastRep: s.lastRep,
          lastRepAt,
          remainingMs: s.mode !== "max" ? s.remainingMs : null,
          best: leader ? { name: leader.name, reps: leader.reps } : null,
        }
      : null,
    /** All-time board: best round per player, any mode. */
    rows,
    /** The active event, if any: show `eventBoard` instead of the all-time board. */
    event,
    eventBoard:
      board && board.kind !== "global"
      ? {
          title:
            board.kind === "team"
              ? `Team · ${MODE_LABELS[board.mode]}`
              : `${MODE_LABELS[board.mode]} · ${board.role ?? "Everyone"}`,
          ...eventRows,
          team: board.kind === "team",
        }
      : null,
    leader: leader ?? null,
    playerCount,
    /** A score posted in the last few seconds, to celebrate. */
    posted,
  };
}
