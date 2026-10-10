import { useCallback, useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { CrowdView, LeaderboardRow, RecentRun } from "../api/types";
import { CATEGORIES, CROWD_CYCLE_MS, CROWD_PAGES, MODE_LABELS, type CrowdPage } from "../config/modes";
import { useBackendEvent, useTick } from "./events";

/** Index into CROWD_PAGES that a pinned view points at, or null for auto. */
function pinnedPage(view: CrowdView): number | null {
  if (view.kind === "recent") return CROWD_PAGES.findIndex((p) => p.kind === "recent");
  if (view.kind === "board") return CROWD_PAGES.findIndex((p) => p.kind === "board" && p.category === view.category);
  return null;
}

/**
 * Crowd screen data: the live round when one is on; otherwise a leaderboard
 * or the recent results, either cycling (auto) or pinned by the operator.
 */
export function useCrowd(rowsPerBoard = 10) {
  const tick = useTick();
  const s = tick?.session;
  const [view, setView] = useState<CrowdView>({ kind: "auto" });
  const [autoIndex, setAutoIndex] = useState(0);
  const [boards, setBoards] = useState<LeaderboardRow[][]>(CATEGORIES.map(() => []));
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [playerCount, setPlayerCount] = useState(0);

  const refresh = useCallback(() => {
    Promise.all(CATEGORIES.map((c) => backend.getLeaderboard(c.id, false, rowsPerBoard))).then(setBoards);
    backend.getRecentRuns(false, rowsPerBoard).then(setRecent);
    backend.getPlayerCount().then(setPlayerCount);
  }, [rowsPerBoard]);

  useEffect(() => {
    refresh();
    backend.getCrowdView().then(setView);
    const cycle = setInterval(() => setAutoIndex((i) => (i + 1) % CROWD_PAGES.length), CROWD_CYCLE_MS);
    const poll = setInterval(refresh, 30_000);
    return () => {
      clearInterval(cycle);
      clearInterval(poll);
    };
  }, [refresh]);
  useBackendEvent(events.onRoundFinished, refresh);
  useBackendEvent(events.onCrowdView, setView);

  const pageIndex = pinnedPage(view) ?? autoIndex;
  const page: CrowdPage = CROWD_PAGES[pageIndex];
  const rows = page.kind === "board" ? boards[CATEGORIES.findIndex((c) => c.id === page.category)] : [];

  const live = !!s && (s.phase === "readyCheck" || s.phase === "countdown" || s.phase === "running");
  return {
    /** A round is in progress: show `round`, not the boards. */
    live,
    round: live
      ? {
          player: s.player,
          modeLabel: s.mode ? MODE_LABELS[s.mode] : "",
          phase: s.phase,
          countdownSeconds: s.phase === "countdown" ? Math.max(1, Math.ceil((s.countdownMs ?? 0) / 1000)) : null,
          cleanReps: s.cleanReps,
          lastRep: s.lastRep,
          remainingMs: s.mode !== "max" ? s.remainingMs : null,
        }
      : null,
    /** Current view setting (auto or pinned). */
    view,
    /** Page being shown now: a board or the recent list. */
    page,
    /** Rows for a board page. */
    rows,
    leader: rows[0] ?? null,
    /** Rows for the recent page, newest first. */
    recent,
    playerCount,
    /** Switch views from the crowd window itself (keys); syncs to the operator. */
    setView: (v: CrowdView) => backend.setCrowdView(v),
  };
}
