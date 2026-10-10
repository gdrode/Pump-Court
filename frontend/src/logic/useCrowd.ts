import { useCallback, useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { LeaderboardRow, RoundResult } from "../api/types";
import { CROWD_POSTED_MS, CROWD_ROWS, MODE_LABELS } from "../config/modes";
import { useBackendEvent, useSession } from "./events";

/**
 * Crowd screen data. While a round is on: the live count. Otherwise: the
 * all-time board, each player's best round in any mode. A newly posted score
 * is highlighted for a few seconds.
 */
export function useCrowd() {
  const s = useSession();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [posted, setPosted] = useState<RoundResult | null>(null);
  const [lastRepAt, setLastRepAt] = useState<number | null>(null);

  const refresh = useCallback(() => {
    backend.getLeaderboard(null, CROWD_ROWS).then(setRows).catch(() => {});
    backend.getPlayerCount().then(setPlayerCount).catch(() => {});
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

  useBackendEvent(events.onRoundFinished, (r) => {
    refresh();
    if (r.runId != null) setPosted(r);
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
    leader: leader ?? null,
    playerCount,
    /** A score posted in the last few seconds, to celebrate. */
    posted,
  };
}
