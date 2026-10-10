import { useCallback, useEffect, useState } from "react";
import { backend, errorText } from "../api/backend";
import type { Category, LeaderboardRow } from "../api/types";
import { CATEGORIES } from "../game/modes";

export function LeaderboardTable({ rows }: { rows: LeaderboardRow[]; }) {
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

/** Operator view: tabs, moderation (delete) and backup export. */
export function Leaderboard({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState<Category>("thirtySecond");
  const [includeTeam, setIncludeTeam] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    backend.getLeaderboard(category, includeTeam, 50).then(setRows).catch((e) => setMessage(errorText(e)));
  }, [category, includeTeam]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  async function remove(row: LeaderboardRow) {
    if (!confirm(`Delete ${row.name}'s run of ${row.cleanReps}?`)) return;
    await backend.deleteRun(row.runId);
    load();
  }

  return (
    <div className="screen leaderboard">
      <h2>Leaderboard</h2>
      <div className="tabs">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={c.id === category ? "active" : ""} onClick={() => setCategory(c.id)}>
            {c.title}
          </button>
        ))}
      </div>
      <LeaderboardTable rows={rows} />
      {rows.length > 0 && (
        <details>
          <summary>Moderation</summary>
          {rows.map((r) => (
            <button key={r.runId} className="small" onClick={() => remove(r)}>Delete {r.name} ({r.cleanReps})</button>
          ))}
        </details>
      )}
      <div className="row">
        <label className="checkbox">
          <input type="checkbox" checked={includeTeam} onChange={(e) => setIncludeTeam(e.target.checked)} />
          Show team runs
        </label>
        <button onClick={() => backend.exportBackup().then((p) => setMessage(`Backup written to ${p}`))}>
          Export backup
        </button>
        <button onClick={onBack}>Back (Esc)</button>
      </div>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}
