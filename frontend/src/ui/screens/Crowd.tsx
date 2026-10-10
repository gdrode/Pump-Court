import { CATEGORIES, CROWD_KEYS, formatSeconds } from "../../config/modes";
import { useCrowd } from "../../logic/useCrowd";
import { useKeys } from "../../logic/useKeys";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { RecentTable } from "../components/RecentTable";
import { RefereeLights } from "../components/RefereeLights";

/**
 * The aisle-facing second window: live count during a round; between rounds
 * a leaderboard or the recent results (cycling, or pinned by the operator).
 * Keys here: 1–3 boards, R recent, A auto.
 */
export function Crowd() {
  const crowd = useCrowd();
  useKeys({
    ...Object.fromEntries(
      CROWD_KEYS.boards.map((key, i) => [key, () => crowd.setView({ kind: "board", category: CATEGORIES[i].id })]),
    ),
    [CROWD_KEYS.recent]: () => crowd.setView({ kind: "recent" }),
    [CROWD_KEYS.auto]: () => crowd.setView({ kind: "auto" }),
  });

  if (crowd.round) {
    const r = crowd.round;
    return (
      <div className="screen crowd crowd-live">
        <div className="player">
          {r.player} <span className="muted">· {r.modeLabel}</span>
        </div>
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

  const page = crowd.page;
  return (
    <div className="screen crowd">
      <h1>Pump Court · {page.title}</h1>
      {page.kind === "board" ? (
        <>
          {crowd.leader && (
            <p className="challenge">
              Beat <b>{crowd.leader.name}</b>: {crowd.leader.cleanReps} clean reps
            </p>
          )}
          <LeaderboardTable rows={crowd.rows} />
        </>
      ) : (
        <RecentTable runs={crowd.recent} />
      )}
      <p className="muted">
        {crowd.playerCount} {crowd.playerCount === 1 ? "person has" : "people have"} competed
      </p>
    </div>
  );
}
