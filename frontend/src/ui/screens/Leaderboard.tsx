import { CATEGORIES } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useLeaderboard } from "../../logic/useLeaderboard";
import { LeaderboardTable } from "../components/LeaderboardTable";

/** Operator view: tabs, moderation (delete) and backup export. */
export function Leaderboard({ onBack }: { onBack: () => void }) {
  const board = useLeaderboard();
  useKeys({ Escape: onBack });

  return (
    <div className="screen leaderboard">
      <h2>Leaderboard</h2>
      <div className="tabs">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={c.id === board.category ? "active" : ""} onClick={() => board.setCategory(c.id)}>
            {c.title}
          </button>
        ))}
      </div>
      <LeaderboardTable rows={board.rows} />
      {board.rows.length > 0 && (
        <details>
          <summary>Moderation</summary>
          {board.rows.map((r) => (
            <button
              key={r.runId}
              className="small"
              onClick={() => confirm(`Delete ${r.name}'s run of ${r.cleanReps}?`) && board.remove(r)}
            >
              Delete {r.name} ({r.cleanReps})
            </button>
          ))}
        </details>
      )}
      <div className="row">
        <label className="checkbox">
          <input type="checkbox" checked={board.includeTeam} onChange={(e) => board.setIncludeTeam(e.target.checked)} />
          Show team runs
        </label>
        <button onClick={board.exportBackup}>Export backup</button>
        <button onClick={onBack}>Back (Esc)</button>
      </div>
      {board.message && <p className="muted">{board.message}</p>}
    </div>
  );
}
