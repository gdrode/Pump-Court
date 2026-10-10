import { useEffect, useRef, useState } from "react";
import { backend } from "../../api/backend";
import type { ReadyItem, RoundMode, RoundResult } from "../../api/types";
import { MODE_LABELS, categoryOf, formatElapsed } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useRound } from "../../logic/useRound";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { Lights } from "../components/Lights";
import { PoseView } from "../components/PoseView";
import { host } from "../host";
import { hostReaction } from "../hostMood";
import { play } from "../sounds";

/** The score shown in the "best" box. */
export interface Target {
  label: string;
  name: string;
  reps: number;
}

interface Props {
  mode: RoundMode;
  player: string;
  isTeam: boolean;
  /** Set in Versus, to show whose turn it is. */
  turn?: { index: number; total: number };
  /** Versus: the best score so far. Otherwise the board record is shown. */
  target?: Target | null;
  onFinished: (result: RoundResult) => void;
  /** Voided run: play the same turn again. */
  onRestart: () => void;
  /** Leave to the menu (cancels the round). */
  onAbort: () => void;
}

/** Labels for the backend's ready-check rows, in order. */
const READY_LABELS: Record<string, string> = {
  body: "Whole body in frame",
  sideOn: "Side-on to camera",
  onePlayer: "One player on the mat",
  distance: "Right distance",
  fps: "Tracking speed",
  startPosition: "Hold the top, arms straight",
};

/**
 * Ready check → countdown → live round, with the camera on the left and the
 * side panel on the right. All game state comes from the backend.
 */
export function Round({ mode, player, isTeam, turn, target, onFinished, onRestart, onAbort }: Props) {
  const [leader, setLeader] = useState<Target | null>(null);
  const [showGo, setShowGo] = useState(false);
  const lastBeep = useRef<number | null>(null);

  const round = useRound({
    mode,
    player,
    isTeam,
    onRep: (rep) => {
      if (rep.clean) play("chime");
      else {
        play("buzzer");
        play("norep");
      }
    },
    onCountdown: () => play("beep"),
    onGo: () => {
      play("go");
      setShowGo(true);
      setTimeout(() => setShowGo(false), 450);
    },
    onFinished: (result) => {
      play("final");
      onFinished(result);
    },
    onVoided: () => play("buzzer"),
  });

  // The record to beat in this category (Versus passes its own target).
  useEffect(() => {
    if (target !== undefined) return;
    backend.getLeaderboard(categoryOf(mode), false, 1).then((rows) => {
      if (rows[0]) setLeader({ label: "Best", name: rows[0].name, reps: rows[0].cleanReps });
    });
  }, [target, mode]);

  // Beep each of the last five seconds.
  const secondsLeft = round.remainingMs !== null ? Math.ceil(round.remainingMs / 1000) : null;
  useEffect(() => {
    if (round.phase === "running" && secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0 && lastBeep.current !== secondsLeft) {
      lastBeep.current = secondsLeft;
      play("beep");
    }
  }, [round.phase, secondsLeft]);

  const abort = () => {
    round.cancel();
    onAbort();
  };
  useKeys({ Escape: abort, r: round.voided ? onRestart : undefined });

  const running = round.phase === "running";
  const best = target === undefined ? leader : target;
  const ahead = best !== null && round.cleanReps > best.reps;
  const urgent =
    running && (secondsLeft !== null ? secondsLeft <= 5 : round.idleRemainingMs !== null && round.idleRemainingMs < 2500);
  const clock = secondsLeft !== null ? String(running ? secondsLeft : Math.ceil((round.remainingMs ?? 0) / 1000)) : formatElapsed(round.elapsedMs);
  const reaction = hostReaction({
    lastRep: round.lastRep,
    lastRepAt: round.lastRepAt,
    cleanReps: round.cleanReps,
    attempts: round.attempts,
    best,
    urgent: urgent && secondsLeft !== null,
    elapsedMs: round.elapsedMs,
  });

  return (
    <>
      <div className="camera">
        <PoseView tick={round.tick} />
        {round.trackingLost && !round.voided && <div className="banner banner--warn camera__banner sketch">Tracking lost, stay in frame</div>}
      </div>

      {(round.countdownSeconds !== null || showGo) && (
        <div className="countdown" aria-live="assertive">
          <span key={round.countdownSeconds ?? "go"} className="countdown__n">
            {round.countdownSeconds ?? "GO"}
          </span>
        </div>
      )}

      {running ? (
        <aside className="side-panel sketch round">
          <div className="round__top">
            <span className="eyebrow">{MODE_LABELS[mode]}</span>
            <span className={`round__clock ${urgent ? "is-urgent" : ""}`}>{clock}</span>
          </div>
          {round.idleRemainingMs !== null && (
            <p className="round__hint">{(round.idleRemainingMs / 1000).toFixed(1)} s left to get the next rep</p>
          )}

          <div className={`scores ${best ? "" : "scores--solo"}`}>
            <div className={`score score--you sketch ${ahead ? "is-ahead" : ""}`}>
              <span className="score__label">{ahead ? "New best!" : player}</span>
              <span className="score__num" key={round.cleanReps}>
                {round.cleanReps}
              </span>
              <span className="score__sub">clean reps</span>
            </div>
            {best && (
              <div className="score score--best sketch">
                <span className="score__label">{best.label}</span>
                <span className="score__num">{best.reps}</span>
                <span className="score__sub">{best.name}</span>
              </div>
            )}
          </div>

          <Lights rep={round.lastRep} flashKey={round.attempts} />

          <Dragon
            action={reaction.action}
            beat={reaction.action === "cheer" || reaction.action === "sad" ? reaction.beat : undefined}
            size="lg"
            bubble="top"
            says={reaction.says}
            mood={reaction.mood}
            className="round__host"
          />

          <KeyHints hints={[["Esc", "Abort", abort]]} />
        </aside>
      ) : (
        <ReadyPanel items={round.readyItems} player={player} turn={turn} fps={round.fps} onBack={abort} />
      )}

      {round.voided && (
        <div className="overlay">
          <div className="overlay__box sketch">
            <h2>Run voided</h2>
            <p>Tracking dropped for more than half a second. The score was not posted.</p>
            <KeyHints
              hints={[
                ["R", "Restart", onRestart],
                ["Esc", "Menu", abort],
              ]}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** The countdown starts only when every row passes. */
function ReadyPanel({
  items,
  player,
  turn,
  fps,
  onBack,
}: {
  items: ReadyItem[];
  player: string;
  turn?: { index: number; total: number };
  fps: number;
  onBack: () => void;
}) {
  const passed = items.filter((i) => i.pass).length;
  const allOk = items.length > 0 && passed === items.length;
  const prompt = items.find((i) => !i.pass)?.prompt ?? undefined;
  const greet = turn && passed < 3;
  return (
    <aside className="side-panel sketch ready">
      <p className="eyebrow">{turn ? `Player ${turn.index + 1} of ${turn.total}` : "Get in position"}</p>
      <h1>{player}</h1>
      <Dragon
        action={allOk ? "cheer" : greet ? "wave" : "idle"}
        size="sm"
        says={allOk ? host.ready(undefined, true) : greet ? host.nextUp(player) : host.ready(prompt, false)}
        mood={allOk ? "good" : undefined}
      />
      <ul className="checklist">
        {(items.length ? items : Object.keys(READY_LABELS).map((id) => ({ id, label: "", pass: false, prompt: null }))).map((r) => (
          <li key={r.id} className={r.pass ? "is-ok" : ""}>
            <span className="checklist__mark sketch">{r.pass ? "✓" : ""}</span>
            {READY_LABELS[r.id] ?? r.label}
            {r.id === "fps" && fps > 0 ? <em>{Math.round(fps)} fps</em> : null}
          </li>
        ))}
      </ul>
      <KeyHints hints={[["Esc", "Back", onBack]]} />
    </aside>
  );
}
