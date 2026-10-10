import {
  addRep,
  clock,
  countdownLeft,
  createGame,
  endGame,
  failLeft,
  goodReps,
  tick,
  type GameState,
  type Mode as GameMode,
  type PlayerLive,
} from "@tracker/game";
import { RepJudge, type RepResult } from "@tracker/judge";
import type { Posture } from "@tracker/posture";
import { useEffect, useRef, useState } from "react";
import type { RepVerdict, RoundMode, RoundResult } from "../api/types";
import { REFEREE_RULES } from "../config/modes";
import { startScorePost } from "./scorePost";
import { useTracker, useTrackerFrames, type TrackerFrame } from "./tracker/TrackerProvider";

export interface DuelOptions {
  /** The menu mode: "duel" (Sprint), "minute" or "max". */
  mode: RoundMode;
  /** Two validated names: player 1 on camera slot 0, player 2 on slot 1. */
  players: string[];
  /** Both rounds ended. Not saved yet: see logic/scorePost.ts (started here). */
  onFinished: (results: RoundResult[]) => void;
  onRep?: (player: number, rep: RepVerdict) => void;
  /** Once per countdown number (3, 2, 1). */
  onCountdown?: (secondsLeft: number) => void;
  onGo?: () => void;
}

/** The menu's modes on the tracker's game clock (pumpCourt/src/game.ts). */
const GAME_MODE: Record<RoundMode, GameMode> = { duel: "sprint", sprint: "sprint", minute: "marathon", max: "max" };

const TICK_MS = 100;
const NOT_LIVE: PlayerLive = { ready: false, inRep: false };

/**
 * A side-by-side Duel: both players at once, one camera each.
 *
 * The rules are the tracker's co-op game (pumpCourt/src/game.ts), the same
 * ones the browser prototype uses: the 3-2-1 starts when both players hold the
 * push-up position, one clock for both, and each player can fail on their own
 * (gets up, gets stuck, stops; the failure window grows with fatigue). Each
 * player has their own tracker (camera slot) and referee. When both are done,
 * the two scores go to the results; they are posted only on request.
 */
export function useDuelMatch(opts: DuelOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const t1 = useTracker(0);
  const t2 = useTracker(1);
  const [game, setGame] = useState<GameState>(() => createGame(GAME_MODE[opts.mode], 2));
  const gameRef = useRef(game);
  gameRef.current = game;
  const [now, setNow] = useState(() => performance.now());
  const judges = useRef<(RepJudge | null)[]>([null, null]);
  const live = useRef<PlayerLive[]>([NOT_LIVE, NOT_LIVE]);
  const [lastRep, setLastRep] = useState<(RepVerdict | null)[]>([null, null]);
  const handedOn = useRef(false);

  // Fresh floor lines for both players when the duel screen opens.
  useEffect(() => {
    t1.resetPosture();
    t2.resetPosture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFrame = (i: 0 | 1) => ({ t, angles, posture }: TrackerFrame) => {
    const judge = judges.current[i];
    live.current[i] = { ready: posture.ready, inRep: !!judge && judge.currentPhase !== "top" };
    const g = gameRef.current;
    if (!judge || g.phase !== "running" || g.players[i]?.finished) return;
    const rep = judge.push(
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
    if (!rep) return;
    setGame((cur) => addRep(cur, i, rep, t));
    const verdict = toVerdict(rep, (g.players[i]?.results.length ?? 0) + 1);
    setLastRep((l) => l.map((x, j) => (j === i ? verdict : x)));
    optsRef.current.onRep?.(i, verdict);
  };
  useTrackerFrames(onFrame(0), 0);
  useTrackerFrames(onFrame(1), 1);

  // The clock: about 10 times a second until the duel is over.
  const finished = game.phase === "finished";
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => {
      const t = performance.now();
      setNow(t);
      setGame((g) => tick(g, t, [live.current[0], live.current[1]]));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [finished]);

  // Fresh referees when the clock starts; none before or after.
  const phase = game.phase;
  useEffect(() => {
    judges.current = phase === "running" ? [new RepJudge(REFEREE_RULES), new RepJudge(REFEREE_RULES)] : [null, null];
    if (phase === "running") optsRef.current.onGo?.();
  }, [phase]);

  const countdownSeconds = phase === "countdown" ? countdownLeft(game, now) : null;
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (countdownSeconds !== null && countdownSeconds !== lastCount.current) {
      lastCount.current = countdownSeconds;
      optsRef.current.onCountdown?.(countdownSeconds);
    }
    if (countdownSeconds === null) lastCount.current = null;
  }, [countdownSeconds]);

  // Both done: hand the two scores on (posting is opt-in, see logic/scorePost.ts).
  useEffect(() => {
    // An operator Stop before the clock started has nothing to show (the screen goes back by itself).
    if (!finished || handedOn.current || game.startT == null) return;
    handedOn.current = true;
    const { mode, players } = optsRef.current;
    const results = game.players.map((p, i): RoundResult => ({
      mode,
      player: players[i],
      reps: goodReps(p),
      attempts: p.results.length,
      perfect: p.results.filter((r) => r.perfect).length,
      noReps: {
        depth: p.results.filter((r) => !r.lights.depth).length,
        torso: p.results.filter((r) => !r.lights.torso).length,
        lockout: p.results.filter((r) => !r.lights.lockout).length,
      },
      durationMs: Math.max(0, (p.finishedAt ?? game.endT ?? 0) - (game.startT ?? game.endT ?? 0)),
      finish: p.finished ?? "ended",
      runId: null,
      rank: null,
    }));
    // Each player's phone camera is let go and shows them their own stats
    // (Fixed camera: the cameras stay and both scores are posted at once).
    startScorePost(results[0], t1.releasePhone);
    startScorePost(results[1], t2.releasePhone);
    optsRef.current.onFinished(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, game]);

  const players = [0, 1].map((i) => {
    const p = game.players[i];
    const tracker = i === 0 ? t1 : t2;
    return {
      name: opts.players[i],
      reps: goodReps(p),
      perfect: p.results.filter((r) => r.perfect).length,
      attempts: p.results.length,
      finished: p.finished,
      lastRep: lastRep[i],
      posture: tracker.live.posture as Posture | null,
      /** ms left before this player fails (stuck or stopped), or null. */
      failLeft: failLeft(game, i, now, live.current[i].inRep),
    };
  });

  return {
    phase,
    countdownSeconds,
    /** Clock to show: time left (Sprint, Marathon) or time elapsed (Max), ms. */
    clockMs: clock(game, now),
    timed: game.mode !== "max",
    players,
    /** The operator stopped the duel. The scores so far go to the results if the clock had started. */
    stop: () => setGame((g) => endGame(g, performance.now())),
  };
}

function toVerdict(r: RepResult, attempt: number): RepVerdict {
  return { attempt, counted: r.counted, perfect: r.perfect, lights: r.lights, faults: r.faults };
}

export type DuelView = ReturnType<typeof useDuelMatch>;
