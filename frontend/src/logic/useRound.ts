import { useEffect, useRef } from "react";
import { backend, events } from "../api/backend";
import type { RepVerdict, RoundMode, RoundResult } from "../api/types";
import { useBackendEvent, useTick } from "./events";

export interface RoundOptions {
  mode: RoundMode;
  player: string;
  isTeam: boolean;
  onFinished: (result: RoundResult) => void;
  onCancel: () => void;
  /** Hooks for sound or animation; all optional. */
  onRep?: (rep: RepVerdict) => void;
  /** Called once per countdown number (3, 2, 1). */
  onCountdown?: (secondsLeft: number) => void;
  onGo?: () => void;
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

  useEffect(() => {
    backend.startRound(opts.mode, opts.player, opts.isTeam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBackendEvent(events.onRep, (rep) => optsRef.current.onRep?.(rep));
  useBackendEvent(events.onRoundFinished, (r) => optsRef.current.onFinished(r));

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
    /** Time left in ms (Sprint/Minute), else null. */
    remainingMs: opts.mode !== "max" ? (session?.remainingMs ?? null) : null,
    /** Max mode: ms left to get the next clean rep, else null. */
    idleRemainingMs: session?.idleRemainingMs ?? null,
    lastRep: session?.lastRep ?? null,
    /** False while running = the player has left the frame. */
    trackingLost: phase === "running" && session?.trackingOk === false,
    cancel: () => {
      backend.cancelRound();
      opts.onCancel();
    },
  };
}

export type RoundView = ReturnType<typeof useRound>;
