import type { RoundResult } from "../api/types";

/** Everything the results screen shows, worked out from the finished turns. */
export function summarizeResults(results: RoundResult[], players: string[]) {
  const latest = results[results.length - 1];
  const nextPlayer = players[results.length] ?? null;
  let duelWinner: string | null | undefined; // undefined = not a finished duel, null = draw
  if (players.length === 2 && results.length === 2) {
    const [a, b] = results;
    const score = (r: RoundResult) => (r.voided ? -1 : r.cleanReps + r.accuracy / 10); // accuracy breaks ties
    duelWinner = score(a) === score(b) ? null : score(a) > score(b) ? a.player : b.player;
  }
  return { latest, all: results, nextPlayer, duelWinner };
}
