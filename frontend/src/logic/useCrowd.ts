import { useCallback, useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { LeaderboardRow } from "../api/types";
import { CATEGORIES, CROWD_CYCLE_MS } from "../config/modes";
import { useBackendEvent, useTick } from "./events";

/** Crowd screen data: the live round when one is on, otherwise cycling boards. */
export function useCrowd(rowsPerBoard = 10) {
  const tick = useTick();
  const s = tick?.session;
  const [tab, setTab] = useState(0);
  const [boards, setBoards] = useState<LeaderboardRow[][]>(CATEGORIES.map(() => []));
  const [playerCount, setPlayerCount] = useState(0);

  const refresh = useCallback(() => {
    Promise.all(CATEGORIES.map((c) => backend.getLeaderboard(c.id, false, rowsPerBoard))).then(setBoards);
    backend.getPlayerCount().then(setPlayerCount);
  }, [rowsPerBoard]);

  useEffect(() => {
    refresh();
    const cycle = setInterval(() => setTab((t) => (t + 1) % CATEGORIES.length), CROWD_CYCLE_MS);
    const poll = setInterval(refresh, 30_000);
    return () => {
      clearInterval(cycle);
      clearInterval(poll);
    };
  }, [refresh]);
  useBackendEvent(events.onRoundFinished, refresh);

  const live = !!s && (s.phase === "readyCheck" || s.phase === "countdown" || s.phase === "running");
  return {
    /** A round is in progress: show `round`, not the boards. */
    live,
    round: live
      ? {
          player: s.player,
          phase: s.phase,
          countdownSeconds: s.phase === "countdown" ? Math.max(1, Math.ceil((s.countdownMs ?? 0) / 1000)) : null,
          cleanReps: s.cleanReps,
          lastRep: s.lastRep,
          remainingMs: s.mode !== "max" ? s.remainingMs : null,
        }
      : null,
    category: CATEGORIES[tab],
    rows: boards[tab],
    leader: boards[tab][0] ?? null,
    playerCount,
  };
}
