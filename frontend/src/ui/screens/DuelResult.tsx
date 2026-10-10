import { fmtPoints } from "@tracker/game";
import type { RoundResult } from "../../api/types";
import { duelOutcome } from "../../logic/results";
import { useScorePosts, type ScorePost } from "../../logic/scorePost";
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

/**
 * Who won the Duel: most points; perfect push-ups break a tie. Posting is
 * opt-in: each player can post from their phone, or the operator posts the
 * scores still waiting (P).
 */
export function DuelResult({ results, onRematch, onDone }: Props) {
  const { ranked, winner, decidedOnPerfect } = duelOutcome(results);
  const posts = useScorePosts(results);
  const postOf = (r: RoundResult) => posts[results.indexOf(r)];
  const waiting = posts.filter((p) => p.status === "pending" || p.status === "failed");
  const postAll = () => waiting.forEach((p) => void p.post("host"));
  useKeys({ Enter: onDone, Escape: onDone, r: onRematch, p: postAll });

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
            <span className="standing__reps">{fmtPoints(r.points)}</span>
            <span className="standing__acc">
              {r.reps} push-ups · {r.perfect} perfect
            </span>
            <span className={`standing__post is-${postOf(r).status}`}>{postLabel(postOf(r))}</span>
          </li>
        ))}
      </ol>
      {decidedOnPerfect && <p className="muted versus__note">Tied on points, decided on perfect push-ups.</p>}
      <div className="versus__foot">
        <button type="button" className="start-btn sketch" onClick={onRematch}>
          Rematch!
        </button>
        <KeyHints
          hints={[
            ...(waiting.length ? [["P", waiting.length > 1 ? "Post both scores" : "Post score", postAll] as [string, string, () => void]] : []),
            ["R", "Rematch", onRematch],
            ["Enter", "Menu", onDone],
          ]}
        />
      </div>
    </div>
  );
}

/** One player's score: on the leaderboard or not. */
function postLabel(p: ScorePost): string {
  switch (p.status) {
    case "posted":
      return p.saved?.rank ? `✓ posted · #${p.saved.rank}` : "✓ posted";
    case "posting":
      return "posting…";
    case "declined":
      return "not posted";
    case "failed":
      return "couldn't save";
    case "discarded":
      return "discarded";
    case "pending":
      return p.onPhone ? "📱 not posted yet" : "not posted yet";
  }
}
