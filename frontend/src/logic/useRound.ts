import { useEffect, useRef, useState } from "react";
import { backend, events } from "../api/backend";
import type { RepVerdict, RoundMode, RoundResult } from "../api/types";
import { useBackendEvent, useTick } from "./events";

export interface RoundOptions {
  mode: RoundMode;
  player: string;
  isTeam: boolean;
  /** The round ended normally. */
  onFinished: (result: RoundResult) => void;
  /** Hooks for sound or animation; all optional. */
  onRep?: (rep: RepVerdict) => void;
  /** Called once per countdown number (3, 2, 1). */
  onCountdown?: (secondsLeft: number) => void;
  onGo?: () => void;
  /** Tracking dropped too long; the backend voided the run (nothing saved). */
  onVoided?: (reason: string) => void;
}

/**
 * A live round: starts it on mount, follows the backend, and reports back.
 * The round screen only renders what this returns.
 */
export function useRound(opts: RoundOptions) {
  const tick = useTick();
  const session = tick?.session ?? null;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [voided, setVoided] = useState<string | null>(null);
  /** performance.now() when the latest rep was judged, for "just happened" effects. */
  const [lastRepAt, setLastRepAt] = useState<number | null>(null);

  useEffect(() => {
    backend.startRound(opts.mode, opts.player, opts.isTeam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBackendEvent(events.onRep, (rep) => {
    setLastRepAt(performance.now());
    optsRef.current.onRep?.(rep);
  });
  useBackendEvent(events.onRoundFinished, (r) => {
    if (r.voided) {
      setVoided(r.voided);
      optsRef.current.onVoided?.(r.voided);
    } else optsRef.current.onFinished(r);
  });

  const phase = session?.phase ?? "idle";
  const countdownSeconds =
    phase === "countdown" ? Math.max(1, Math.ceil((session?.countdownMs ?? 0) / 1000)) : null;

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
    /** Raw frame: landmarks, angles, preview image. Pass to <PoseView>. */
    tick,
    phase,
    player: opts.player,
    mode: opts.mode,
    readyItems: session?.readyItems ?? [],
    countdownSeconds,
    cleanReps: session?.cleanReps ?? 0,
    attempts: session?.attempts ?? 0,
    /** ms since the clock started. */
    elapsedMs: session?.elapsedMs ?? 0,
    /** Time left in ms (Sprint/Minute/Versus), else null. */
    remainingMs: opts.mode !== "max" ? (session?.remainingMs ?? null) : null,
    /** Max mode: ms left to get the next clean rep, else null. */
    idleRemainingMs: session?.idleRemainingMs ?? null,
    lastRep: session?.lastRep ?? null,
    lastRepAt,
    /** Player's own straight-arm angle once calibrated (lockout threshold used). */
    lockoutThreshold: session?.lockoutThreshold ?? null,
    /** True while running and the player has left the frame. */
    trackingLost: phase === "running" && session?.trackingOk === false,
    /** Why the run was voided, once it was. */
    voided,
    fps: tick?.fps ?? 0,
    /** Stop the round without saving. */
    cancel: () => backend.cancelRound(),
  };
}

export type RoundView = ReturnType<typeof useRound>;
