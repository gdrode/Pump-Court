import type { RoundResult } from "../../api/types";
import { CATEGORIES, MODE_LABELS, REFEREE_LABELS, REFEREES, categoryOf } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  result: RoundResult;
  /** Label for the main button, e.g. "Post score" or "Post & Ana's turn". */
  nextLabel: string;
  /** "Discard" for solo, "Redo turn" in Versus. */
  discardLabel: string;
  onPost: () => void;
  onDiscard: () => void;
}

export function Results({ result: r, nextLabel, discardLabel, onPost, onDiscard }: Props) {
  useKeys({ Enter: onPost, Escape: onDiscard });
  const category = CATEGORIES.find((c) => c.id === categoryOf(r.mode))?.title;
  const noReps: Record<string, number> = { ...r.noReps };

  return (
    <div className="results">
      <div className="results__main sketch">
        <p className="eyebrow">
          {MODE_LABELS[r.mode]} · {category}
          {r.isTeam && " · team run"}
        </p>
        <h1 className="results__name">{r.player}</h1>
        <div className="results__score">
          <span>{r.cleanReps}</span>
          <small>clean reps</small>
        </div>
        <div className="results__stats">
          <div>
            <b>{r.attempts}</b>
            <span>attempts</span>
          </div>
          <div>
            <b>{Math.round(r.accuracy * 100)}%</b>
            <span>accuracy</span>
          </div>
          {!r.isTeam && (
            <div>
              <b>{r.rank ? `#${r.rank}` : "–"}</b>
              <span>rank</span>
            </div>
          )}
        </div>
        <div className="results__noreps">
          <h3>No-reps</h3>
          {REFEREES.map((ref) => (
            <div key={ref} className="norep-row">
              <span>{REFEREE_LABELS[ref]}</span>
              <span className="norep-row__bar">
                {Array.from({ length: noReps[ref] ?? 0 }).map((_, i) => (
                  <i key={i} />
                ))}
              </span>
              <b>{noReps[ref] ?? 0}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="results__side">
        <Dragon
          action={r.rank === 1 ? "hype" : r.cleanReps === 0 ? "sad" : "cheer"}
          beat={r.rank ?? 0}
          size="lg"
          bubble="top"
          says={host.results(r.cleanReps, r.isTeam ? null : r.rank)}
          mood={r.rank === 1 ? "good" : undefined}
        />
        <button type="button" className="start-btn sketch" onClick={onPost}>
          {nextLabel}
        </button>
        <KeyHints
          hints={[
            ["Enter", nextLabel, onPost],
            ["Esc", discardLabel, onDiscard],
          ]}
        />
      </div>
    </div>
  );
}
