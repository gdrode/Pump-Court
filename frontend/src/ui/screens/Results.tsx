import { FINISH_TEXT } from "@tracker/game";
import type { RoundResult } from "../../api/types";
import { MODE_LABELS, REFEREE_LABELS, REFEREES } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  result: RoundResult;
  /** Label for the main button, e.g. "Post score" or "Post & Ana's turn". */
  nextLabel: string;
  /** "Discard" for solo, "Redo turn" in a Duel. */
  discardLabel: string;
  onPost: () => void;
  onDiscard: () => void;
}

export function Results({ result: r, nextLabel, discardLabel, onPost, onDiscard }: Props) {
  useKeys({ Enter: onPost, Escape: onDiscard });

  return (
    <div className="results">
      <div className="results__main sketch">
        <p className="eyebrow">{MODE_LABELS[r.mode]}</p>
        <h1 className="results__name">{r.player}</h1>
        {r.finish && <p className="results__finish">{FINISH_TEXT[r.finish]}</p>}
        <div className="results__score">
          <span>{r.reps}</span>
          <small>push-ups</small>
        </div>
        <div className="results__stats">
          <div>
            <b>{r.attempts}</b>
            <span>attempts</span>
          </div>
          <div>
            <b>{r.perfect}</b>
            <span>perfect (3 white)</span>
          </div>
          <div>
            <b>{r.rank ? `#${r.rank}` : "–"}</b>
            <span>rank</span>
          </div>
        </div>
        <div className="results__noreps">
          <h3>Red lights</h3>
          {REFEREES.map((ref) => (
            <div key={ref} className="norep-row">
              <span>{REFEREE_LABELS[ref]}</span>
              <span className="norep-row__bar">
                {Array.from({ length: r.noReps[ref] }).map((_, i) => (
                  <i key={i} />
                ))}
              </span>
              <b>{r.noReps[ref]}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="results__side">
        <Dragon
          action={r.rank === 1 ? "hype" : r.reps === 0 ? "sad" : "cheer"}
          beat={r.rank ?? 0}
          size="lg"
          bubble="top"
          says={host.results(r.reps, r.rank)}
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
