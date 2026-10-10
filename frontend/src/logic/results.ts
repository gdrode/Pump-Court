import type { RoundResult } from "../api/types";

/** Clean reps first, accuracy breaks ties; voided runs rank last. */
export function rankResults(results: RoundResult[]): RoundResult[] {
  const score = (r: RoundResult) => (r.voided ? -1 : r.cleanReps);
  return [...results].sort((a, b) => score(b) - score(a) || b.accuracy - a.accuracy);
}

/** Final standings of a Versus game. `winner` is null on a full tie. */
export function versusOutcome(results: RoundResult[]) {
  const ranked = rankResults(results);
  const [first, second] = ranked;
  const tie = !!second && first.cleanReps === second.cleanReps && first.accuracy === second.accuracy;
  return {
    ranked,
    winner: tie || !first ? null : first.player,
    decidedOnAccuracy: !tie && !!second && first.cleanReps === second.cleanReps,
  };
}

/** In Versus, everyone after the first player chases the best score so far. */
export function bestSoFar(results: RoundResult[]): { name: string; reps: number } | null {
  const best = rankResults(results)[0];
  return best && !best.voided ? { name: best.player, reps: best.cleanReps } : null;
}
