import { useCallback, useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { CrowdView, LeaderboardRow, RecentRun, RoundResult } from "../api/types";
import {
  CATEGORIES,
  CROWD_CYCLE_MS,
  CROWD_PAGES,
  CROWD_POSTED_MS,
  MODE_LABELS,
  categoryOf,
  type CrowdPage,
} from "../config/modes";
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
 * A newly posted score takes over for a few seconds.
 */
export function useCrowd(rowsPerBoard = 10) {
  const tick = useTick();
  const s = tick?.session;
  const [view, setView] = useState<CrowdView>({ kind: "auto" });
  const [autoIndex, setAutoIndex] = useState(0);
  const [boards, setBoards] = useState<LeaderboardRow[][]>(CATEGORIES.map(() => []));
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [posted, setPosted] = useState<RoundResult | null>(null);
  const [lastRepAt, setLastRepAt] = useState<number | null>(null);

  const refresh = useCallback(() => {
    Promise.all(CATEGORIES.map((c) => backend.getLeaderboard(c.id, false, rowsPerBoard))).then(setBoards);
    backend.getRecentRuns(false, rowsPerBoard).then(setRecent);
    backend.getPlayerCount().then(setPlayerCount);
  }, [rowsPerBoard]);

  useEffect(() => {
    refresh();
    backend.getCrowdView().then(setView);
    const poll = setInterval(refresh, 30_000);
    return () => clearInterval(poll);
  }, [refresh]);

  // Cycle pages while idle (paused while a new score is being shown).
  useEffect(() => {
    if (posted) return;
    const cycle = setInterval(() => setAutoIndex((i) => (i + 1) % CROWD_PAGES.length), CROWD_CYCLE_MS);
    return () => clearInterval(cycle);
  }, [posted]);

  useEffect(() => {
    if (!posted) return;
    const t = setTimeout(() => setPosted(null), CROWD_POSTED_MS);
    return () => clearTimeout(t);
  }, [posted]);

  useBackendEvent(events.onRoundFinished, (r) => {
    refresh();
    // Team and voided runs never go on the public board.
    if (!r.voided && !r.isTeam && r.runId != null) setPosted(r);
  });
  useBackendEvent(events.onRep, () => setLastRepAt(performance.now()));
  useBackendEvent(events.onCrowdView, setView);

  // A new score shows its own board; otherwise the pinned page or the cycle.
  const postedPage = posted ? CROWD_PAGES.findIndex((p) => p.kind === "board" && p.category === categoryOf(posted.mode)) : -1;
  const pageIndex = postedPage >= 0 ? postedPage : (pinnedPage(view) ?? autoIndex);
  const page: CrowdPage = CROWD_PAGES[pageIndex];
  const boardOf = (category: string) => boards[CATEGORIES.findIndex((c) => c.id === category)] ?? [];
  const rows = page.kind === "board" ? boardOf(page.category) : [];

  const live = !!s && (s.phase === "readyCheck" || s.phase === "countdown" || s.phase === "running");
  const liveLeader = live && s.mode ? boardOf(categoryOf(s.mode))[0] : undefined;
  return {
    /** A round is in progress: show `round`, not the boards. */
    live,
    round: live
      ? {
          player: s.player ?? "",
          mode: s.mode,
          modeLabel: s.mode ? MODE_LABELS[s.mode] : "",
          phase: s.phase,
          countdownSeconds: s.phase === "countdown" ? Math.max(1, Math.ceil((s.countdownMs ?? 0) / 1000)) : null,
          cleanReps: s.cleanReps,
          attempts: s.attempts,
          elapsedMs: s.elapsedMs,
          lastRep: s.lastRep,
          lastRepAt,
          remainingMs: s.mode !== "max" ? s.remainingMs : null,
          /** The board record for this mode, to beat. */
          best: liveLeader ? { name: liveLeader.name, reps: liveLeader.cleanReps } : null,
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
    /** A score posted in the last few seconds, to celebrate. */
    posted,
    /** Switch views from the crowd window itself (keys); syncs to the operator. */
    setView: (v: CrowdView) => backend.setCrowdView(v),
  };
}
