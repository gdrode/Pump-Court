import type { RoundResult } from "../../api/types";
import { duelOutcome } from "../../logic/results";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  results: RoundResult[];
  onRematch: () => void;
  onDone: () => void;
}

const ORDINAL = ["1st", "2nd"];

/** Who won the Duel: most push-ups; perfect push-ups break a tie. */
export function DuelResult({ results, onRematch, onDone }: Props) {
  const { ranked, winner, decidedOnPerfect } = duelOutcome(results);
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
            <span className="standing__reps">{r.reps}</span>
            <span className="standing__acc">{r.perfect} perfect</span>
          </li>
        ))}
      </ol>
      {decidedOnPerfect && <p className="muted versus__note">Tied on push-ups, decided on perfect push-ups.</p>}
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
