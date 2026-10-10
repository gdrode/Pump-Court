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
  cleanReps: number;
  attempts: number;
  /** Score to beat, if any. */
  best: { reps: number } | null;
  /** Last five seconds of a timed round. */
  urgent: boolean;
  elapsedMs: number;
}

/**
 * What the dragon does and says during a round. Shared by the round screen
 * and the crowd screen so both show the same reaction.
 */
export function hostReaction({ lastRep, lastRepAt, cleanReps, attempts, best, urgent, elapsedMs }: Input): HostState {
  const sinceLast = lastRepAt === null ? Infinity : performance.now() - lastRepAt;
  const fresh = lastRep !== null && sinceLast < 1300;
  const fail = lastRep && !lastRep.clean ? lastRep.lights.find((l) => !l.pass) : undefined;
  const ahead = best !== null && cleanReps > best.reps;
  const justBeat = best !== null && !!lastRep?.clean && cleanReps === best.reps + 1;
  const seed = elapsedMs / 3000;
  const beat = attempts;

  if (fresh && fail) return { action: "sad", says: host.noRep(fail.referee), mood: "bad", beat };
  if (fresh && justBeat) return { action: "hype", says: host.newBest, mood: "good", beat };
  if (urgent) return { action: "hurry", says: host.lastSeconds, beat };
  if (fresh) return { action: ahead ? "hype" : "cheer", says: host.rep(cleanReps), mood: "good", beat };
  if (!lastRep) return { action: "curl", says: host.go, beat };
  if (sinceLast > 2500) return { action: "hurry", says: host.keepGoing(seed), beat };
  return { action: "curl", says: host.pace(seed), beat };
}
