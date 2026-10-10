import { useEffect, useState } from "react";
import { backend, events } from "../api/backend";
import type { LeaderboardRow } from "../api/types";
import { RefereeLights } from "../components/RefereeLights";
import { CATEGORIES, formatSeconds } from "../game/modes";
import { useBackendEvent, useTick } from "../hooks/useBackend";
import { LeaderboardTable } from "./Leaderboard";

const CYCLE_MS = 8000;

/** The aisle-facing second window: live count during a round, boards when idle. */
export function Crowd() {
  const tick = useTick();
  const s = tick?.session;
  const [tab, setTab] = useState(0);
  const [boards, setBoards] = useState<LeaderboardRow[][]>([[], [], []]);
  const [players, setPlayers] = useState(0);

  const refresh = () => {
    Promise.all(CATEGORIES.map((c) => backend.getLeaderboard(c.id, false, 10))).then(setBoards);
    backend.getPlayerCount().then(setPlayers);
  };
  useEffect(() => {
    refresh();
    const cycle = setInterval(() => setTab((t) => (t + 1) % CATEGORIES.length), CYCLE_MS);
    const poll = setInterval(refresh, 30_000);
    return () => {
      clearInterval(cycle);
      clearInterval(poll);
    };
  }, []);
  useBackendEvent(events.onRoundFinished, refresh);

  const live = s && s.phase !== "idle" && s.phase !== "finished" && s.mode !== "practice";
  if (live) {
    return (
      <div className="screen crowd crowd-live">
        <div className="player">{s.player}</div>
        {s.phase === "running" ? (
          <>
            <div className="count giant">{s.cleanReps}</div>
            <RefereeLights rep={s.lastRep} big />
            {s.remainingMs != null && s.mode !== "max" && <div className="timer">{formatSeconds(s.remainingMs)}s</div>}
          </>
        ) : (
          <div className="count giant">{s.phase === "countdown" ? Math.max(1, Math.ceil((s.countdownMs ?? 0) / 1000)) : "Get ready"}</div>
        )}
      </div>
    );
  }

  const leader = boards[tab][0];
  return (
    <div className="screen crowd">
      <h1>Pump Court · {CATEGORIES[tab].title}</h1>
      {leader && (
        <p className="challenge">
          Beat <b>{leader.name}</b>: {leader.cleanReps} clean reps
        </p>
      )}
      <LeaderboardTable rows={boards[tab]} />
      <p className="muted">{players} {players === 1 ? "person has" : "people have"} competed</p>
    </div>
  );
}
