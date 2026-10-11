import { RepJudge, type RepResult } from "@tracker/judge";
import { useEffect, useRef, useState } from "react";
import { backend, events } from "../api/backend";
import type { EventTags, RepVerdict, RoundMode, RoundResult } from "../api/types";
import { REFEREE_RULES } from "../config/modes";
import { useBackendEvent, useSession } from "./events";
import { startScorePost } from "./scorePost";
import { useTracker, useTrackerFrames } from "./tracker/TrackerProvider";

export interface RoundOptions {
  mode: RoundMode;
  player: string;
  /** A solo round at the active event: posted with the player's role and team. */
  tags?: EventTags;
  /** A Duel turn: posted at once (to the solo board of the mode), not opt-in. */
  autoPost?: boolean;
  /** The round ended. Not saved yet: see logic/scorePost.ts (started here). */
  onFinished: (result: RoundResult) => void;
  /** Hooks for sound or animation; all optional. */
  onRep?: (rep: RepVerdict) => void;
  /** Called once per countdown number (3, 2, 1). */
  onCountdown?: (secondsLeft: number) => void;
  onGo?: () => void;
}

/**
 * A live round. The tracker (pumpCourt/src) and referee run here, in the app
 * window; the backend keeps the clock and the score:
 *
 *   tracker posture ready ─▶ setReady  ─▶ backend starts the 3-2-1 countdown
 *   (and in a rep or not: the backend ends the round if the player fails)
 *   RepJudge result       ─▶ reportRep ─▶ backend counts it while the clock runs
 *   backend `tick`/`rep`/`round-finished` ─▶ this hook ─▶ the round screen
 */
export function useRound(opts: RoundOptions) {
  const tracker = useTracker();
  const session = useSession();
  const optsRef = useRef(opts);
  optsRef.current = opts;
  /** performance.now() when the latest rep was judged, for "just happened" effects. */
  const [lastRepAt, setLastRepAt] = useState<number | null>(null);
  const judgeRef = useRef<RepJudge | null>(null);
  /** Last "ready / in a rep" sent to the backend, e.g. "true/false". */
  const sentReady = useRef<string | null>(null);
  const done = useRef(false);

  // Start on mount. Leaving the screen before the end abandons the round.
  useEffect(() => {
    done.current = false;
    sentReady.current = null;
    judgeRef.current = null;
    tracker.resetPosture();
    void backend.startRound(opts.mode, opts.player);
    return () => {
      judgeRef.current = null;
      if (!done.current) void backend.cancelRound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = session?.phase ?? "idle";

  // A fresh referee for the running clock. A push-up must finish before the
  // buzzer: one still in progress when the clock stops doesn't count.
  useEffect(() => {
    judgeRef.current = phase === "running" ? new RepJudge(REFEREE_RULES) : null;
  }, [phase]);

  useTrackerFrames(({ t, angles, posture }) => {
    const rep = judgeRef.current?.push(
      t,
      angles && {
        elbow: angles.elbow,
        hip: angles.abdomen,
        knee: angles.knee,
        bodyOffset: angles.bodyOffset,
        depth: posture.height,
        shoulderY: angles.shoulderY,
        ready: posture.ready,
      },
    );
    if (rep) report(rep);
    // After the rep, so a finished rep is never mistaken for being stuck in one.
    const inRep = !!judgeRef.current && judgeRef.current.currentPhase !== "top";
    const live = `${posture.ready}/${inRep}`;
    if (live !== sentReady.current) {
      sentReady.current = live;
      void backend.setReady(posture.ready, inRep);
    }
  });

  useBackendEvent(events.onRep, (rep) => {
    setLastRepAt(performance.now());
    optsRef.current.onRep?.(rep);
  });
  useBackendEvent(events.onRoundFinished, (r) => {
    if (done.current || r.player !== optsRef.current.player) return;
    done.current = true;
    // A phone camera is let go now (the next player pairs their own) and shows this player
    // their stats; with Fixed camera on, the camera stays and the score is posted at once.
    const { tags } = optsRef.current;
    const result = tags ? { ...r, ...tags } : r;
    startScorePost(result, tracker.releasePhone, optsRef.current.autoPost);
    optsRef.current.onFinished(result);
  });

  const countdownSeconds = phase === "countdown" ? Math.max(1, Math.ceil((session?.countdownMs ?? 0) / 1000)) : null;

  // Fire onCountdown once per number, and onGo when the clock starts.
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (countdownSeconds !== null && countdownSeconds !== lastCount.current) {
      lastCount.current = countdownSeconds;
      optsRef.current.onCountdown?.(countdownSeconds);
    } else if (phase === "running" && lastCount.current !== null) {
      lastCount.current = null;
      optsRef.current.onGo?.();
    }
  }, [countdownSeconds, phase]);

  return {
    phase,
    player: opts.player,
    mode: opts.mode,
    /** The tracker's push-up position check (for the get-ready checklist). */
    posture: tracker.live.posture,
    countdownSeconds,
    /** The score: 1 per 2-light rep, 2 per perfect rep, 2.2–2.5 on a streak. */
    points: session?.points ?? 0,
    /** Valid push-ups (2–3 white lights). */
    reps: session?.reps ?? 0,
    attempts: session?.attempts ?? 0,
    perfect: session?.perfect ?? 0,
    /** Perfect reps in a row, and the multiplier for the next perfect rep. */
    streak: session?.streak ?? 0,
    multiplier: session?.multiplier ?? 1,
    /** ms since the clock started. */
    elapsedMs: session?.elapsedMs ?? 0,
    /** Time left in ms (Sprint, Marathon, Duel), else null. */
    remainingMs: opts.mode !== "max" ? (session?.remainingMs ?? null) : null,
    /** ms left before the player fails (stuck in a rep, or no push-up in time), else null. */
    failRemainingMs: session?.failRemainingMs ?? null,
    lastRep: session?.lastRep ?? null,
    lastRepAt,
    /** Stop the round without saving. */
    cancel: () => {
      done.current = true;
      return backend.cancelRound();
    },
  };
}

/** Sends one judged rep to the backend. */
function report(r: RepResult) {
  void backend.reportRep({ counted: r.counted, perfect: r.perfect, lights: r.lights, faults: r.faults });
}

export type RoundView = ReturnType<typeof useRound>;
