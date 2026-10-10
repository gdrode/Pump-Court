import { useCrowd } from "../../logic/useCrowd";
import { Dragon } from "../components/Dragon";
import { LeaderboardTable, TeamTable } from "../components/LeaderboardTable";
import { Lights } from "../components/Lights";
import { host } from "../host";
import { hostReaction } from "../hostMood";
import { Logo } from "../components/Logo";

/**
 * The aisle-facing second window. Live round → big count, lights and the
 * dragon. Otherwise → the all-time board: each player's best round in any
 * mode (name, mode, push-ups); during an event, its boards in turn.
 */
export function Crowd() {
  const crowd = useCrowd();

  if (crowd.round) {
    const r = crowd.round;
    const secondsLeft = r.remainingMs !== null ? Math.ceil(r.remainingMs / 1000) : null;
    const running = r.phase === "running";
    const urgent = running && secondsLeft !== null && secondsLeft <= 5;
    const reaction = hostReaction({
      lastRep: r.lastRep,
      lastRepAt: r.lastRepAt,
      reps: r.reps,
      attempts: r.attempts,
      best: r.best,
      urgent,
      elapsedMs: r.elapsedMs,
    });
    return (
      <div className="crowd crowd--live">
        <div className="crowd__head">
          <span className="eyebrow">{r.modeLabel} · now on the mat</span>
          <h1>{r.player}</h1>
        </div>
        {running ? (
          <>
            <div className="crowd__count" key={r.reps}>
              {r.reps}
            </div>
            {secondsLeft !== null && <div className={`crowd__clock ${urgent ? "is-urgent" : ""}`}>{secondsLeft}s</div>}
            {r.best && (
              <div className={`crowd__best ${r.reps > r.best.reps ? "is-beaten" : ""}`}>
                {r.reps > r.best.reps ? `Passed ${r.best.name}'s ${r.best.reps}!` : `All-time best: ${r.best.name} ${r.best.reps}`}
              </div>
            )}
            <div className="crowd__live-row">
              <Lights rep={r.lastRep} flashKey={r.attempts} size="xl" showFaults={false} />
              <Dragon
                action={reaction.action}
                beat={reaction.action === "cheer" || reaction.action === "sad" ? reaction.beat : undefined}
                says={reaction.says}
                mood={reaction.mood}
                size="lg"
                bubble="top"
              />
            </div>
          </>
        ) : (
          <div className="crowd__count" key={r.countdownSeconds ?? "ready"}>
            {r.countdownSeconds ?? "Get ready"}
          </div>
        )}
      </div>
    );
  }

  const posted = crowd.posted;
  const says = posted
    ? host.posted(posted.player, posted.reps, crowd.rows.find((row) => row.runId === posted.runId)?.rank ?? null)
    : crowd.leader
      ? host.idle(crowd.leader.name, crowd.leader.reps)
      : host.idle(null, null);

  return (
    <div className="crowd crowd--idle">
      <Logo variant="crowd" />
      <div className="crowd__body">
        <Dragon action={posted ? "hype" : "curl"} size="lg" bubble="top" says={says} mood={posted ? "good" : undefined} />
        <div className="crowd__board">
          {crowd.event && crowd.eventBoard ? (
            <>
              <div className="crowd__tabs">
                <span className="sketch is-on">
                  {crowd.event.name} · {crowd.eventBoard.title}
                </span>
              </div>
              {crowd.eventBoard.team ? (
                <TeamTable rows={crowd.eventBoard.teams} big />
              ) : (
                <LeaderboardTable rows={crowd.eventBoard.players} big highlight={posted?.player} />
              )}
            </>
          ) : (
            <>
              <div className="crowd__tabs">
                <span className="sketch is-on">Most push-ups · all time</span>
              </div>
              <LeaderboardTable rows={crowd.rows} big showMode highlight={posted?.player} />
            </>
          )}
          {crowd.playerCount > 0 && (
            <p className="crowd__count-note muted">
              {crowd.playerCount} {crowd.playerCount === 1 ? "person has" : "people have"} competed so far
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
