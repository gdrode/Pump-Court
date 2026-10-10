import { FINISH_TEXT } from "@tracker/game";
import type { RoundResult } from "../../api/types";
import { MODE_LABELS, REFEREE_LABELS, REFEREES } from "../../config/modes";
import { useScorePosts, type ScorePost } from "../../logic/scorePost";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  result: RoundResult;
  /** Duel taking turns: the next player's name, or null after the last turn. Unset when solo. */
  nextPlayer?: string | null;
  /** Move on; `posted` says whether the score went on the leaderboard. */
  onNext: (posted: boolean) => void;
  /** The score was thrown away (solo: home; Duel: redo the turn). */
  onDiscard: () => void;
}

/**
 * The finished round. Posting is opt-in (logic/scorePost.ts): Enter posts the
 * score unless the player already chose on their phone, Esc throws it away.
 */
export function Results({ result, nextPlayer, onNext, onDiscard }: Props) {
  const [post] = useScorePosts([result]);
  const r = post.saved ?? result;
  const duel = nextPlayer !== undefined;
  const decided = post.status === "posted" || post.status === "declined";
  const then = nextPlayer ? `${nextPlayer}'s turn` : duel ? "see who won" : null;
  const nextLabel = decided
    ? then
      ? cap(then)
      : post.status === "posted"
        ? "See the leaderboard"
        : "Done"
    : then
      ? `Post & ${then}`
      : "Post score";
  const discardLabel = duel ? "Redo turn" : "Discard";

  const next = async () => {
    if (post.status === "posting") return;
    if (decided) return onNext(post.status === "posted");
    if (await post.post("host")) onNext(true); // a failed save stays here, to try again
  };
  const discard = () => {
    post.discard();
    onDiscard();
  };
  useKeys({ Enter: () => void next(), Escape: discard });

  return (
    <div className="results">
      <div className="results__main sketch">
        <p className="eyebrow">{MODE_LABELS[r.mode]}</p>
        <h1 className="results__name">{r.player}</h1>
        {r.finish && <p className="results__finish">{FINISH_TEXT[r.finish]}</p>}
        <p className={`results__post is-${post.status}`}>{postText(post, r.player)}</p>
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
        <button type="button" className="start-btn sketch" onClick={() => void next()} disabled={post.status === "posting"}>
          {nextLabel}
        </button>
        <KeyHints
          hints={[
            ["Enter", nextLabel, () => void next()],
            ["Esc", discardLabel, discard],
          ]}
        />
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where the score stands, in plain words. */
function postText(post: ScorePost, player: string): string {
  switch (post.status) {
    case "pending":
      return post.onPhone
        ? `📱 ${player} can post this from their phone. Not on the leaderboard yet.`
        : "Not on the leaderboard yet.";
    case "posting":
      return "Posting…";
    case "posted":
      return post.by === "phone" ? `✓ Posted from ${player}'s phone` : "✓ Posted to the leaderboard";
    case "declined":
      return `${player} chose not to post this score.`;
    case "failed":
      return "Couldn't save the score. Try again.";
    case "discarded":
      return "Discarded.";
  }
}
