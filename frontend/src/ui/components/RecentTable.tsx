import type { RecentRun } from "../../api/types";
import { MODE_LABELS } from "../../config/modes";

/** Latest results across all modes: name, mode and how they did. */
export function RecentTable({ runs }: { runs: RecentRun[] }) {
  if (runs.length === 0) return <p className="muted">No results yet.</p>;
  return (
    <table className="board">
      <thead>
        <tr><th>Name</th><th>Mode</th><th>Clean reps</th><th>Accuracy</th><th>No-reps</th><th>Time</th></tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.runId}>
            <td>{r.name}</td>
            <td>{MODE_LABELS[r.mode] ?? r.mode}</td>
            <td>{r.cleanReps}</td>
            <td>{Math.round(r.accuracy * 100)}%</td>
            <td className="muted">
              depth {r.noReps.depth} · lockout {r.noReps.lockout} · plank {r.noReps.plank}
            </td>
            <td>{new Date(r.postedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
