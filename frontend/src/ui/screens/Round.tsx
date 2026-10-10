import { fmtPoints } from "@tracker/game";
import { POSTURE_MESSAGE, type Posture, type PostureState } from "@tracker/posture";
import { useEffect, useRef, useState } from "react";
import type { EventTags, RoundMode, RoundResult } from "../../api/types";
import { MODE_LABELS, formatElapsed } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useRound } from "../../logic/useRound";
import { useBoardRecord } from "../../logic/useBoardRecord";
import { CameraPicker } from "../components/CameraPicker";
import { CameraView } from "../components/CameraView";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { Lights } from "../components/Lights";
import { StreakFx } from "../components/StreakFx";
import { StreakBadge } from "../components/StreakBadge";
import { host } from "../host";
import { hostReaction } from "../hostMood";
import { play } from "../sounds";

/** Show "Keep going!" this long before the player would fail. */
const WARN_MS = 3000;

/** The score shown in the "best" box. */
export interface Target {
  label: string;
  name: string;
  points: number;
}

interface Props {
  mode: RoundMode;
  player: string;
  /** Set in a Duel, to show whose turn it is. */
  turn?: { index: number; total: number };
  /** Duel: the first player's score. Otherwise this mode's record is shown. */
  target?: Target | null;
  /** A solo round at the active event: posted with the player's role and team. */
  tags?: EventTags;
  onFinished: (result: RoundResult) => void;
  /** Leave to the menu (cancels the round). */
  onAbort: () => void;
}

/**
 * Get ready → countdown → live round, with the camera on the left and the
 * side panel on the right. The clock and score come from the backend; the
 * tracker and referee run in this window (see useRound).
 */
export function Round({ mode, player, turn, target, tags, onFinished, onAbort }: Props) {
  const [showGo, setShowGo] = useState(false);
  const lastBeep = useRef<number | null>(null);
  const record = useBoardRecord(target === undefined ? mode : null);

  const round = useRound({
    mode,
    player,
    tags,
    onRep: (rep) => {
      if (rep.counted) play("chime");
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
  });

  // Beep each of the last five seconds.
  const secondsLeft = round.remainingMs !== null ? Math.ceil(round.remainingMs / 1000) : null;
  useEffect(() => {
    if (round.phase === "running" && secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0 && lastBeep.current !== secondsLeft) {
      lastBeep.current = secondsLeft;
      play("beep");
    }
  }, [round.phase, secondsLeft]);

  const abort = () => {
    void round.cancel();
    onAbort();
  };
  useKeys({ Escape: abort });

  const running = round.phase === "running";
  const best = target === undefined ? (record ? { label: "Record", ...record } : null) : target;
  const ahead = best !== null && round.points > best.points;
  const urgent =
    running && (secondsLeft !== null ? secondsLeft <= 5 : round.failRemainingMs !== null && round.failRemainingMs <= WARN_MS);
  const clock = secondsLeft !== null ? String(secondsLeft) : formatElapsed(round.elapsedMs);
  const reaction = hostReaction({
    lastRep: round.lastRep,
    lastRepAt: round.lastRepAt,
    points: round.points,
    streak: round.streak,
    attempts: round.attempts,
    best,
    urgent: urgent && secondsLeft !== null,
    elapsedMs: round.elapsedMs,
  });

  return (
    <>
      <div className="camera">
        <CameraView rotatable={round.phase !== "running"} />
      </div>
      <StreakFx streak={round.streak} active={running} />

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
          {round.failRemainingMs !== null && round.failRemainingMs <= WARN_MS && (
            <p className="round__hint">Keep going! {Math.ceil(round.failRemainingMs / 1000)}</p>
          )}

          <div className={`scores ${best ? "" : "scores--solo"}`}>
            <div className={`score score--you sketch ${ahead ? "is-ahead" : ""}`}>
              <span className="score__label">{ahead ? "New best!" : player}</span>
              <span className="score__num" key={round.points}>
                {fmtPoints(round.points)}
              </span>
              <span className="score__sub">
                points · {round.reps} push-ups
              </span>
              <StreakBadge streak={round.streak} multiplier={round.multiplier} />
            </div>
            {best && (
              <div className="score score--best sketch">
                <span className="score__label">{best.label}</span>
                <span className="score__num">{fmtPoints(best.points)}</span>
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
        <ReadyPanel posture={round.posture} player={player} turn={turn} counting={round.phase === "countdown"} onBack={abort} />
      )}
    </>
  );
}

/** The get-ready checklist, one row per step of the tracker's posture check, in order. */
const STEPS: { state: PostureState; label: string }[] = [
  { state: "no-player", label: "Whole body in view, side-on" },
  { state: "no-hands", label: "Near hand in view" },
  { state: "not-down", label: "Down in the push-up position" },
  { state: "knees-down", label: "Knees off the floor, legs straight" },
  { state: "hands-off-floor", label: "Hands on the floor, under the shoulders" },
  { state: "settle", label: "Hold still at the top, arms straight" },
];
const ORDER: PostureState[] = ["no-player", "no-hands", "not-down", "knees-down", "hands-off-floor", "settle", "ready"];

/** The countdown starts when every row passes (the posture check says "ready"). */
function ReadyPanel({
  posture,
  player,
  turn,
  counting,
  onBack,
}: {
  posture: Posture | null;
  player: string;
  turn?: { index: number; total: number };
  counting: boolean;
  onBack: () => void;
}) {
  const state = counting ? "ready" : (posture?.state ?? "no-player");
  const reached = ORDER.indexOf(state);
  const allOk = state === "ready";
  const greet = turn && reached < 2;
  return (
    <aside className="side-panel sketch ready">
      <p className="eyebrow">{turn ? `Player ${turn.index + 1} of ${turn.total}` : "Get in position"}</p>
      <h1>{player}</h1>
      <Dragon
        action={allOk ? "cheer" : greet ? "wave" : "idle"}
        size="sm"
        says={allOk ? host.ready(undefined, true) : greet ? host.nextUp(player) : host.ready(POSTURE_MESSAGE[state], false)}
        mood={allOk ? "good" : undefined}
      />
      <ul className="checklist">
        {STEPS.map((s, i) => {
          const ok = reached > i;
          return (
            <li key={s.state} className={ok ? "is-ok" : ""}>
              <span className="checklist__mark sketch">{ok ? "✓" : ""}</span>
              {s.label}
            </li>
          );
        })}
      </ul>
      {!counting && <CameraPicker label="Camera for this round" />}
      <KeyHints hints={[["Esc", "Back", onBack]]} />
    </aside>
  );
}
