import { fmtPoints } from "@tracker/game";
import type { LeaderboardRow, TeamRow } from "../../api/types";
import { MODE_LABELS } from "../../config/modes";

/** Ranks 1–3 get the podium colours: gold, silver, bronze. */
const PODIUM = ["", "is-gold", "is-silver", "is-bronze"];
const podiumClass = (rank: number) => (rank >= 1 && rank <= 3 ? `is-podium ${PODIUM[rank]}` : "");

interface Props {
  rows: LeaderboardRow[];
  limit?: number;
  /** Show the mode column (the all-time board mixes modes). */
  showMode?: boolean;
  /** Name to mark as "← you". */
  highlight?: string;
  /** Row index selected by the operator (for delete). */
  selected?: number;
  big?: boolean;
}

export function LeaderboardTable({ rows, limit = 10, showMode = false, highlight, selected, big }: Props) {
  if (rows.length === 0) return <p className="board__empty">No scores yet. Be the first.</p>;
  return (
    <table className={`board ${big ? "board--big" : ""}`}>
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Name</th>
          {showMode && <th>Mode</th>}
          <th className="num">Points</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((r, i) => (
          <tr
            key={r.runId}
            className={[
              highlight && r.name.toLowerCase() === highlight.toLowerCase() ? "is-highlight" : "",
              selected === i ? "is-selected" : "",
              podiumClass(r.rank),
            ].join(" ")}
          >
            <td className="num">
              <span className="board__rank">{r.rank}</span>
            </td>
            <td className="board__name">{r.name}</td>
            {showMode && <td className="board__mode">{MODE_LABELS[r.mode] ?? r.mode}</td>}
            <td className="num board__reps">{fmtPoints(r.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A team leaderboard: each team's members' bests, added up. */
export function TeamTable({ rows, limit = 10, big }: { rows: TeamRow[]; limit?: number; big?: boolean }) {
  if (rows.length === 0) return <p className="board__empty">No teams yet. Type a team name when entering yours.</p>;
  return (
    <table className={`board ${big ? "board--big" : ""}`}>
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Team</th>
          <th className="num">Players</th>
          <th className="num">Points</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((r) => (
          <tr key={r.team} className={podiumClass(r.rank)}>
            <td className="num">
              <span className="board__rank">{r.rank}</span>
            </td>
            <td className="board__name">{r.team}</td>
            <td className="num board__mode">{r.members}</td>
            <td className="num board__reps">{fmtPoints(r.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
