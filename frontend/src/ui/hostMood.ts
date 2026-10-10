import { repPoints, streakMultiplier } from "@tracker/game";
import { REFEREES } from "../config/modes";
import type { RepVerdict } from "../api/types";
import type { DragonAction } from "./components/Dragon";
import { host } from "./host";

export interface HostState {
  action: DragonAction;
  says: string;
  mood?: "good" | "bad";
  /** Changes on every rep so one-shot moves (cheer, sad) replay. */
  beat: number;
}

interface Input {
  lastRep: RepVerdict | null;
  /** performance.now() when lastRep arrived. */
  lastRepAt: number | null;
  /** Points so far. */
  points: number;
  /** Perfect reps in a row (the last rep scored with the multiplier before it). */
  streak: number;
  attempts: number;
  /** Score to beat, if any. */
  best: { points: number } | null;
  /** Last five seconds of a timed round. */
  urgent: boolean;
  elapsedMs: number;
}

/**
 * What the dragon does and says during a round. Shared by the round screen
 * and the crowd screen so both show the same reaction.
 */
export function hostReaction({ lastRep, lastRepAt, points, streak, attempts, best, urgent, elapsedMs }: Input): HostState {
  const sinceLast = lastRepAt === null ? Infinity : performance.now() - lastRepAt;
  const fresh = lastRep !== null && sinceLast < 1300;
  const red = lastRep ? REFEREES.find((l) => !lastRep.lights[l]) : undefined;
  const ahead = best !== null && points > best.points;
  // This rep took the score past the best.
  const justBeat = ahead && !!lastRep?.counted && points - repPoints(lastRep, streakMultiplier(Math.max(0, streak - 1))) <= best.points;
  const seed = elapsedMs / 3000;
  const beat = attempts;

  if (fresh && lastRep && !lastRep.counted && red) return { action: "sad", says: host.noRep(red), mood: "bad", beat };
  if (fresh && justBeat) return { action: "hype", says: host.newBest, mood: "good", beat };
  if (urgent) return { action: "hurry", says: host.lastSeconds, beat };
  if (fresh && lastRep) {
    const says = red ? `${host.rep(points, false)} ${host.tip(red)}` : host.rep(points, lastRep.perfect);
    return { action: ahead ? "hype" : "cheer", says, mood: "good", beat };
  }
  if (!lastRep) return { action: "curl", says: host.go, beat };
  if (sinceLast > 2500) return { action: "hurry", says: host.keepGoing(seed), beat };
  return { action: "curl", says: host.pace(seed), beat };
}
