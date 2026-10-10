import type { LeaderboardRow } from "../../api/types";

export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return <p className="muted">No scores yet. Be the first!</p>;
  return (
    <table className="board">
      <thead>
        <tr><th>#</th><th>Name</th><th>Clean reps</th><th>Accuracy</th><th>Posted</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.runId}>
            <td>{r.rank}</td>
            <td>{r.name}</td>
            <td>{r.cleanReps}</td>
            <td>{Math.round(r.accuracy * 100)}%</td>
            <td>{new Date(r.postedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
