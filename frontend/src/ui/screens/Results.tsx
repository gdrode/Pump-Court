import type { RoundResult } from "../../api/types";
import { summarizeResults } from "../../logic/results";
import { useKeys } from "../../logic/useKeys";

interface Props {
  results: RoundResult[];
  players: string[];
  onNext: () => void;
  onAgain: () => void;
  onLeaderboard: () => void;
  onHome: () => void;
}

export function Results({ results, players, onNext, onAgain, onLeaderboard, onHome }: Props) {
  const { latest: r, all, nextPlayer, duelWinner } = summarizeResults(results, players);
  useKeys({ Enter: nextPlayer ? onNext : onAgain, Escape: onHome, l: onLeaderboard });

  return (
    <div className="screen results">
      {duelWinner !== undefined && <h1>{duelWinner ? `${duelWinner} wins!` : "It's a draw!"}</h1>}
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
      {duelWinner !== undefined && (
        <p className="muted">{all.map((x) => `${x.player}: ${x.cleanReps}`).join("  ·  ")}</p>
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
