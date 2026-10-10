import type { RoundResult } from "../../api/types";
import { versusOutcome } from "../../logic/results";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  results: RoundResult[];
  onRematch: () => void;
  onDone: () => void;
}

const ORDINAL = ["1st", "2nd", "3rd", "4th"];

/** Final standings for a Versus game: clean reps first, accuracy breaks ties. */
export function VersusResult({ results, onRematch, onDone }: Props) {
  const { ranked, winner, decidedOnAccuracy } = versusOutcome(results);
  useKeys({ Enter: onDone, Escape: onDone, r: onRematch });

  return (
    <div className="versus">
      <div className="versus__head">
        <Dragon action={winner ? "hype" : "cheer"} size="lg" bubble="right" says={host.winner(winner)} mood="good" />
      </div>
      <ol className="standings">
        {ranked.map((r, i) => (
          <li
            key={r.player}
            className={`standing sketch standing--${i + 1} ${i === 0 && winner ? "is-winner" : ""}`}
            style={{ animationDelay: `${(ranked.length - i) * 140}ms` }}
          >
            <span className="standing__place">{ORDINAL[i]}</span>
            <span className="standing__name">{r.player}</span>
            <span className="standing__reps">{r.cleanReps}</span>
            <span className="standing__acc">{Math.round(r.accuracy * 100)}%</span>
          </li>
        ))}
      </ol>
      {decidedOnAccuracy && <p className="muted versus__note">Tied on reps, decided on accuracy.</p>}
      <div className="versus__foot">
        <button type="button" className="start-btn sketch" onClick={onRematch}>
          Rematch!
        </button>
        <KeyHints
          hints={[
            ["R", "Rematch", onRematch],
            ["Enter", "Menu", onDone],
          ]}
        />
      </div>
    </div>
  );
}
