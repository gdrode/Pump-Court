import { CATEGORIES, CROWD_KEYS, CROWD_PAGES } from "../../config/modes";
import { useCrowd } from "../../logic/useCrowd";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { Lights } from "../components/Lights";
import { RecentTable } from "../components/RecentTable";
import { host } from "../host";
import { hostReaction } from "../hostMood";
import { TitleLights } from "./Home";

/**
 * The aisle-facing second window. Live round → big count, lights and the
 * dragon. Idle → the three boards and the recent results, cycling or pinned
 * by the operator. Keys here: 1–3 boards, R recent, A cycle.
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
    const secondsLeft = r.remainingMs !== null ? Math.ceil(r.remainingMs / 1000) : null;
    const running = r.phase === "running";
    const urgent = running && secondsLeft !== null && secondsLeft <= 5;
    const reaction = hostReaction({
      lastRep: r.lastRep,
      lastRepAt: r.lastRepAt,
      cleanReps: r.cleanReps,
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
            <div className="crowd__count" key={r.cleanReps}>
              {r.cleanReps}
            </div>
            {secondsLeft !== null && <div className={`crowd__clock ${urgent ? "is-urgent" : ""}`}>{secondsLeft}s</div>}
            {r.best && (
              <div className={`crowd__best ${r.cleanReps > r.best.reps ? "is-beaten" : ""}`}>
                {r.cleanReps > r.best.reps ? `Passed ${r.best.name}'s ${r.best.reps}!` : `Best: ${r.best.name} ${r.best.reps}`}
              </div>
            )}
            <div className="crowd__live-row">
              <Lights rep={r.lastRep} flashKey={r.attempts} size="xl" />
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

  const page = crowd.page;
  const posted = crowd.posted;
  const says = posted
    ? host.posted(posted.player, posted.cleanReps, posted.rank)
    : page.kind === "board"
      ? host.idle(crowd.leader?.name ?? null, crowd.leader?.cleanReps ?? null) + (crowd.leader ? ` (${page.title})` : "")
      : `${crowd.playerCount} ${crowd.playerCount === 1 ? "person has" : "people have"} competed so far!`;

  return (
    <div className="crowd crowd--idle">
      <h1 className="title title--crowd">
        <TitleLights />
        Pump Court
      </h1>
      <div className="crowd__body">
        <Dragon action={posted ? "hype" : "curl"} size="lg" bubble="top" says={says} mood={posted ? "good" : undefined} />
        <div className="crowd__board">
          <div className="crowd__tabs">
            {CROWD_PAGES.map((p) => (
              <span key={p.title} className={`sketch ${p.title === page.title ? "is-on" : ""}`}>
                {p.title}
              </span>
            ))}
          </div>
          {page.kind === "board" ? (
            <LeaderboardTable rows={crowd.rows} big highlight={posted?.player} />
          ) : (
            <RecentTable runs={crowd.recent} big />
          )}
        </div>
      </div>
    </div>
  );
}
