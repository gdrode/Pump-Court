import type { RoundResult } from "../api/types";

/** Most points first; perfect push-ups break a tie. */
export function rankResults(results: RoundResult[]): RoundResult[] {
  return [...results].sort((a, b) => b.points - a.points || b.perfect - a.perfect);
}

/** Outcome of a Duel. `winner` is null on a full tie. */
export function duelOutcome(results: RoundResult[]) {
  const ranked = rankResults(results);
  const [first, second] = ranked;
  const tie = !!second && first.points === second.points && first.perfect === second.perfect;
  return {
    ranked,
    winner: tie || !first ? null : first.player,
    decidedOnPerfect: !tie && !!second && first.points === second.points,
  };
}

/** In a Duel, the second player chases the first player's score. */
export function scoreToBeat(results: RoundResult[]): { name: string; points: number } | null {
  const best = rankResults(results)[0];
  return best ? { name: best.player, points: best.points } : null;
}
