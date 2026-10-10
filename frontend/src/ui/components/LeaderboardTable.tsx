import type { LeaderboardRow } from "../../api/types";
import { formatPosted } from "../../config/modes";

interface Props {
  rows: LeaderboardRow[];
  limit?: number;
  /** Name to mark as "← you". */
  highlight?: string;
  /** Row index selected by the operator (for delete). */
  selected?: number;
  big?: boolean;
}

export function LeaderboardTable({ rows, limit = 10, highlight, selected, big }: Props) {
  if (rows.length === 0) return <p className="board__empty">No scores yet. Be the first.</p>;
  return (
    <table className={`board ${big ? "board--big" : ""}`}>
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Name</th>
          <th className="num">Reps</th>
          <th className="num">Accuracy</th>
          <th className="num">Posted</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((r, i) => (
          <tr
            key={r.runId}
            className={[
              highlight && r.name.toLowerCase() === highlight.toLowerCase() ? "is-highlight" : "",
              selected === i ? "is-selected" : "",
              r.rank === 1 ? "is-first" : "",
            ].join(" ")}
          >
            <td className="num">{r.rank}</td>
            <td className="board__name">{r.name}</td>
            <td className="num board__reps">{r.cleanReps}</td>
            <td className="num">{Math.round(r.accuracy * 100)}%</td>
            <td className="num board__time">{formatPosted(r.postedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
