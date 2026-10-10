import { useEffect, useRef } from "react";
import { backend } from "../api/backend";
import type { GhostRun, RoundMode, RoundResult } from "../api/types";
import { sounds } from "../audio/sounds";
import { AnglePanel } from "../components/AnglePanel";
import { PoseView } from "../components/PoseView";
import { ReadyChecklist } from "../components/ReadyChecklist";
import { RefereeLights } from "../components/RefereeLights";
import { formatSeconds } from "../game/modes";
import { events } from "../api/backend";
import { useBackendEvent, useTick } from "../hooks/useBackend";

interface Props {
  mode: RoundMode;
  player: string;
  isTeam: boolean;
  ghost: GhostRun | null;
  onFinished: (result: RoundResult) => void;
  onCancel: () => void;
}

/** Ready check → countdown → live round. All state comes from the backend. */
export function RoundScreen({ mode, player, isTeam, ghost, onFinished, onCancel }: Props) {
  const tick = useTick();
  const s = tick?.session;
  const lastCountdownSecond = useRef<number | null>(null);

  // Start the round when the screen opens; cancel it if we leave early.
  useEffect(() => {
    backend.startRound(mode, player, isTeam);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancel() {
    backend.cancelRound();
    onCancel();
  }

  useBackendEvent(events.onRep, (rep) => (rep.clean ? sounds.chime() : sounds.buzzer()));
  useBackendEvent(events.onRoundFinished, (result) => {
    sounds.finalBuzzer();
    onFinished(result);
  });

  // Beep on each countdown second.
  useEffect(() => {
    if (s?.phase === "countdown" && s.countdownMs != null) {
      const sec = Math.ceil(s.countdownMs / 1000);
      if (sec !== lastCountdownSecond.current) {
        lastCountdownSecond.current = sec;
        sec > 0 ? sounds.countdown() : sounds.go();
      }
    } else if (s?.phase === "running" && lastCountdownSecond.current !== null) {
      lastCountdownSecond.current = null;
      sounds.go();
    }
  }, [s?.phase, s?.countdownMs]);

  const ghostCount = ghost && s ? ghost.repTimesMs.filter((t) => t <= s.elapsedMs).length : null;
  const lastRep = s?.lastRep ?? null;

  return (
    <div className="screen round">
      <div className="round-video">
        <PoseView tick={tick} />
        {s?.phase === "readyCheck" && (
          <div className="overlay">
            <h2>Get into position</h2>
            <ReadyChecklist items={s.readyItems} />
          </div>
        )}
        {s?.phase === "countdown" && (
          <div className="overlay countdown">{Math.max(1, Math.ceil((s.countdownMs ?? 0) / 1000))}</div>
        )}
        {s?.phase === "running" && !s.trackingOk && <div className="banner bad">Tracking lost — stay in frame</div>}
      </div>

      <aside className="round-side">
        <div className="player">{player}</div>
        <div className="count">{s?.cleanReps ?? 0}</div>
        <div className="muted">clean reps · {s?.attempts ?? 0} attempts</div>
        {s?.remainingMs != null && mode !== "max" && <div className="timer">{formatSeconds(s.remainingMs)}s</div>}
        {s?.idleRemainingMs != null && <div className="timer">{formatSeconds(s.idleRemainingMs)}s to next rep</div>}
        {ghost && (
          <div className="ghost">
            👻 {ghost.name}: <b>{ghostCount}</b>
          </div>
        )}
        <RefereeLights rep={lastRep} />
        {lastRep && !lastRep.clean && (
          <ul className="reasons">
            {lastRep.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
        {mode === "practice" && <AnglePanel tick={tick} />}
        <button onClick={cancel}>{mode === "practice" ? "Done" : "Cancel"} (Esc)</button>
      </aside>
    </div>
  );
}
