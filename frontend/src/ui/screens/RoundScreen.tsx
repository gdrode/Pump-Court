import type { RoundMode, RoundResult } from "../../api/types";
import { formatSeconds } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useRound } from "../../logic/useRound";
import { PoseView } from "../components/PoseView";
import { ReadyChecklist } from "../components/ReadyChecklist";
import { RefereeLights } from "../components/RefereeLights";
import { sounds } from "../sounds";

interface Props {
  mode: RoundMode;
  player: string;
  isTeam: boolean;
  onFinished: (result: RoundResult) => void;
  onCancel: () => void;
}

/** Ready check → countdown → live round. */
export function RoundScreen(props: Props) {
  const round = useRound({
    ...props,
    onRep: (rep) => (rep.clean ? sounds.chime() : sounds.buzzer()),
    onCountdown: () => sounds.countdown(),
    onGo: () => sounds.go(),
    onFinished: (result) => {
      sounds.finalBuzzer();
      props.onFinished(result);
    },
  });
  useKeys({ Escape: round.cancel });

  return (
    <div className="screen round">
      <div className="round-video">
        <PoseView tick={round.tick} />
        {round.phase === "readyCheck" && (
          <div className="overlay">
            <h2>Get into position</h2>
            <ReadyChecklist items={round.readyItems} />
          </div>
        )}
        {round.countdownSeconds !== null && <div className="overlay countdown">{round.countdownSeconds}</div>}
        {round.trackingLost && <div className="banner bad">Tracking lost — stay in frame</div>}
      </div>

      <aside className="round-side">
        <div className="player">{round.player}</div>
        <div className="count">{round.cleanReps}</div>
        <div className="muted">clean reps · {round.attempts} attempts</div>
        {round.remainingMs !== null && <div className="timer">{formatSeconds(round.remainingMs)}s</div>}
        {round.idleRemainingMs !== null && (
          <div className="timer">{formatSeconds(round.idleRemainingMs)}s to next rep</div>
        )}
        <RefereeLights rep={round.lastRep} />
        {round.lastRep && !round.lastRep.clean && (
          <ul className="reasons">
            {round.lastRep.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
        <button onClick={round.cancel}>Cancel (Esc)</button>
      </aside>
    </div>
  );
}
