import { useEffect } from "react";
import type { RoundResult } from "../api/types";

interface Props {
  results: RoundResult[];
  /** Duel: more players still to go. */
  nextPlayer: string | null;
  onNext: () => void;
  onAgain: () => void;
  onLeaderboard: () => void;
  onHome: () => void;
}

export function Results({ results, nextPlayer, onNext, onAgain, onLeaderboard, onHome }: Props) {
  const r = results[results.length - 1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") (nextPlayer ? onNext : onAgain)();
      else if (e.key === "Escape") onHome();
      else if (e.key.toLowerCase() === "l") onLeaderboard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextPlayer, onNext, onAgain, onLeaderboard, onHome]);

  const duelDone = results.length === 2 && !nextPlayer;
  let duelLine: string | null = null;
  if (duelDone) {
    const [a, b] = results;
    const score = (x: RoundResult) => x.cleanReps + x.accuracy / 10; // accuracy breaks ties
    duelLine = score(a) === score(b) ? "It's a draw!" : `${score(a) > score(b) ? a.player : b.player} wins!`;
  }

  return (
    <div className="screen results">
      {duelLine && <h1>{duelLine}</h1>}
      <h2>{r.player}</h2>
      {r.voided ? (
        <p className="error">Round voided: {r.voided}</p>
      ) : (
        <>
          <div className="count">{r.cleanReps}</div>
          <p>clean reps · {Math.round(r.accuracy * 100)}% accuracy ({r.attempts} attempts)</p>
          <table className="no-reps">
            <tbody>
              <tr><td>No-reps for depth</td><td>{r.noReps.depth}</td></tr>
              <tr><td>No-reps for lockout</td><td>{r.noReps.lockout}</td></tr>
              <tr><td>No-reps for plank</td><td>{r.noReps.plank}</td></tr>
            </tbody>
          </table>
          {r.rank != null && <p className="rank">Rank #{r.rank}</p>}
          {r.isTeam && <p className="muted">Team run — hidden from the public ranking.</p>}
        </>
      )}
      {duelDone && (
        <p className="muted">
          {results.map((x) => `${x.player}: ${x.cleanReps}`).join("  ·  ")}
        </p>
      )}
      <div className="row">
        {nextPlayer ? (
          <button className="primary" onClick={onNext}>{nextPlayer}'s turn (Enter)</button>
        ) : (
          <button className="primary" onClick={onAgain}>Play again (Enter)</button>
        )}
        <button onClick={onLeaderboard}>Leaderboard (L)</button>
        <button onClick={onHome}>Home (Esc)</button>
      </div>
    </div>
  );
}
