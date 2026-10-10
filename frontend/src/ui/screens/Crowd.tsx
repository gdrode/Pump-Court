import { formatSeconds } from "../../config/modes";
import { useCrowd } from "../../logic/useCrowd";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { RefereeLights } from "../components/RefereeLights";

/** The aisle-facing second window: live count during a round, boards when idle. */
export function Crowd() {
  const crowd = useCrowd();

  if (crowd.round) {
    const r = crowd.round;
    return (
      <div className="screen crowd crowd-live">
        <div className="player">{r.player}</div>
        {r.phase === "running" ? (
          <>
            <div className="count giant">{r.cleanReps}</div>
            <RefereeLights rep={r.lastRep} big />
            {r.remainingMs != null && <div className="timer">{formatSeconds(r.remainingMs)}s</div>}
          </>
        ) : (
          <div className="count giant">{r.countdownSeconds ?? "Get ready"}</div>
        )}
      </div>
    );
  }

  return (
    <div className="screen crowd">
      <h1>Pump Court · {crowd.category.title}</h1>
      {crowd.leader && (
        <p className="challenge">
          Beat <b>{crowd.leader.name}</b>: {crowd.leader.cleanReps} clean reps
        </p>
      )}
      <LeaderboardTable rows={crowd.rows} />
      <p className="muted">
        {crowd.playerCount} {crowd.playerCount === 1 ? "person has" : "people have"} competed
      </p>
    </div>
  );
}
