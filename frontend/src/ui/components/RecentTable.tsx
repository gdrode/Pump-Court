import type { RecentRun } from "../../api/types";
import { MODE_LABELS, formatPosted } from "../../config/modes";

/** Latest results across all modes: name, mode and how they did. */
export function RecentTable({ runs, big }: { runs: RecentRun[]; big?: boolean }) {
  if (runs.length === 0) return <p className="board__empty">No results yet.</p>;
  return (
    <table className={`board ${big ? "board--big" : ""}`}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Mode</th>
          <th className="num">Reps</th>
          <th className="num">Accuracy</th>
          <th>No-reps</th>
          <th className="num">Posted</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.runId}>
            <td className="board__name">{r.name}</td>
            <td className="recent__mode">{MODE_LABELS[r.mode] ?? r.mode}</td>
            <td className="num board__reps">{r.cleanReps}</td>
            <td className="num">{Math.round(r.accuracy * 100)}%</td>
            <td className="recent__noreps">
              depth {r.noReps.depth} · lockout {r.noReps.lockout} · plank {r.noReps.plank}
            </td>
            <td className="num board__time">{formatPosted(r.postedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
