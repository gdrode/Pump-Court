import { FINISH_TEXT } from "@tracker/game";
import { POSTURE_MESSAGE } from "@tracker/posture";
import { useState } from "react";
import type { RoundMode, RoundResult } from "../../api/types";
import { MODE_LABELS, formatElapsed } from "../../config/modes";
import { TrackerSlot, useTracker } from "../../logic/tracker/TrackerProvider";
import { useDuelMatch, type DuelView } from "../../logic/useDuelMatch";
import { useKeys } from "../../logic/useKeys";
import { CameraPicker } from "../components/CameraPicker";
import { CameraView } from "../components/CameraView";
import { KeyHints } from "../components/KeyHints";
import { Lights } from "../components/Lights";
import { play } from "../sounds";

interface Props {
  mode: RoundMode;
  players: string[];
  onFinished: (results: RoundResult[]) => void;
  /** Back to the menu (nothing saved). */
  onAbort: () => void;
  /** No second camera: play the duel as turns on one camera instead. */
  onTakeTurns: () => void;
}

/** Show "Keep going!" this long before a player would fail. */
const WARN_MS = 3000;

const NOTE: Record<DuelView["phase"], string> = {
  waiting: "Both players: get side-on to your camera in the push-up position, arms straight. The countdown starts when both are ready.",
  countdown: "Get ready… the countdown won't stop now.",
  running: "Go! Most push-ups wins.",
  finished: "Done!",
};

/**
 * Split-screen Duel: both players at once, each on their own camera. The
 * screen is cut in half top to bottom: player 1 on top, player 2 below. Before
 * the clock: each side picks its camera (or pairs a phone); the 3-2-1 starts
 * once both hold the push-up position. Rules: logic/useDuelMatch.ts.
 */
export function DuelRound({ mode, players, onFinished, onAbort, onTakeTurns }: Props) {
  const [showGo, setShowGo] = useState(false);
  const duel = useDuelMatch({
    mode,
    players,
    onFinished: (results) => {
      play("final");
      onFinished(results);
    },
    onRep: (_i, rep) => {
      if (rep.counted) play("chime");
      else play("buzzer");
    },
    onCountdown: () => play("beep"),
    onGo: () => {
      play("go");
      setShowGo(true);
      setTimeout(() => setShowGo(false), 450);
    },
  });

  const before = duel.phase === "waiting" || duel.phase === "countdown";
  const stopOrBack = () => (duel.phase === "waiting" ? onAbort() : duel.stop());
  useKeys({ Escape: stopOrBack });

  const seconds = Math.ceil(duel.clockMs / 1000);
  const clock = duel.timed ? String(seconds) : formatElapsed(duel.clockMs);
  const urgent = duel.phase === "running" && duel.timed && seconds <= 5;

  return (
    <div className="duel">
      <header className="duel__bar sketch">
        <span className="eyebrow">Duel · {MODE_LABELS[mode === "duel" ? "sprint" : mode]}</span>
        <span className={`round__clock ${urgent ? "is-urgent" : ""}`}>{clock}</span>
        <KeyHints hints={[["Esc", duel.phase === "waiting" ? "Back" : "Stop", stopOrBack]]} />
      </header>

      {/* Always there (only the words change), so the split screen never moves. */}
      <p className="duel__note">{NOTE[duel.phase]}</p>

      <div className="duel__sides" aria-label="Split screen: player 1 on top, player 2 below">
        {[0, 1].map((i) => (
          <TrackerSlot key={i} slot={i as 0 | 1}>
            <DuelSide index={i} duel={duel} pickCamera={before} />
          </TrackerSlot>
        ))}
      </div>

      {(duel.countdownSeconds !== null || showGo) && (
        <div className="countdown" aria-live="assertive">
          <span key={duel.countdownSeconds ?? "go"} className="countdown__n">
            {duel.countdownSeconds ?? "GO"}
          </span>
        </div>
      )}

      <div className="duel__foot" style={{ visibility: duel.phase === "waiting" ? "visible" : "hidden" }}>
        <button type="button" className="add-player sketch" onClick={onTakeTurns} disabled={duel.phase !== "waiting"}>
          Only one camera? Take turns instead
        </button>
      </div>
    </div>
  );
}

/**
 * One player's half of the split screen: their camera across most of the
 * width, and a panel beside it with the score, lights and (before the clock)
 * the camera picker. Reads the tracker of its slot.
 */
function DuelSide({ index, duel, pickCamera }: { index: number; duel: DuelView; pickCamera: boolean }) {
  const tracker = useTracker();
  const p = duel.players[index];

  let banner: string | null = null;
  let kind = "";
  if (p.finished) {
    banner = FINISH_TEXT[p.finished];
    kind = "is-done";
  } else if (duel.phase === "waiting" || duel.phase === "running") {
    if (!tracker.hasCamera) banner = "Pick a camera for this player on the right";
    else if (p.posture && !p.posture.ready) banner = POSTURE_MESSAGE[p.posture.state];
    else if (duel.phase === "waiting") {
      banner = "✓ Ready";
      kind = "is-ready";
    } else if (p.failLeft !== null && p.failLeft <= WARN_MS) {
      banner = `Keep going! ${Math.ceil(p.failLeft / 1000)}`;
      kind = "is-warn";
    }
  }

  return (
    <section className={`duel-side duel-side--${index + 1}`}>
      <div className="duel-side__camera">
        <CameraView rotatable={pickCamera && tracker.hasCamera} />
        <span className="duel-side__tag sketch">
          P{index + 1} · {p.name}
        </span>
        {banner && <div className={`duel-side__banner sketch ${kind}`}>{banner}</div>}
      </div>

      <div className="duel-side__panel">
        <div className="score score--you sketch">
          <span className="score__label">{p.name}</span>
          <span className="score__num" key={p.reps}>
            {p.reps}
          </span>
          <span className="score__sub">
            push-ups · {p.perfect} perfect
          </span>
        </div>
        <Lights rep={p.lastRep} flashKey={p.attempts} showFaults={false} />

        {pickCamera && (
          <CameraPicker label={`Camera for player ${index + 1}`} emptyLabel={index === 0 ? "Default camera" : "Choose a camera…"} />
        )}
      </div>
    </section>
  );
}
