// Posting a finished round to the leaderboard. Opt-in: nothing is saved until
// someone posts it.
//
//   round ends ─▶ ScorePost (pending) ─┬─ operator presses Post (Enter)     ─▶ save_round ─▶ posted
//                                      ├─ player taps "Post my score" (phone) ─▶ save_round ─▶ posted
//                                      └─ player taps "Don't post" (phone)  ─▶ declined (never saved)
//
// With "Fixed camera" on (logic/fixedCamera.ts) the score is posted at once,
// without asking, and the phone (if any) keeps filming for the next player.
//
// When the round was filmed with a phone, the phone gets the stats and the two
// buttons, and hears about every change. The phone is let go (its link closed)
// once the choice is made, or after PHONE_WAIT_MS.
import { useEffect, useReducer } from "react";
import { backend } from "../api/backend";
import type { PhoneRoundStats, PostStatus, RoundResult } from "../api/types";
import { MODE_LABELS } from "../config/modes";
import { FINISH_TEXT } from "@tracker/game";
import { isFixedCamera } from "./fixedCamera";
import type { ReleasedPhone } from "./tracker/TrackerProvider";

/** How long a player has to choose on their phone before it is let go. */
export const PHONE_WAIT_MS = 10 * 60_000;
/** After the choice, the phone link stays open this long so the last note reaches it. */
const LINGER_MS = 3000;

export class ScorePost {
  status: PostStatus = "pending";
  /** Who decided: the operator ("host") or the player on their phone. */
  by: "host" | "phone" | null = null;
  /** The posted round, with its database id and rank. */
  saved: RoundResult | null = null;
  private listeners = new Set<() => void>();
  private phone: ReleasedPhone | null;
  private timer = 0;

  constructor(
    readonly result: RoundResult,
    phone: ReleasedPhone | null,
    autoPost = false,
  ) {
    this.phone = phone;
    if (autoPost) void this.post("host");
    if (!phone) return;
    phone.link.setHandlers({
      onStatus: () => {},
      onStream: () => {},
      onPost: (post) => void (post ? this.post("phone") : this.decline("phone")),
    });
    phone.link.notify({ type: "round-over", stats: phoneStats(result), status: this.status });
    this.timer = window.setTimeout(() => this.letPhoneGo(0), PHONE_WAIT_MS);
  }

  /** The round was filmed with a phone that can still show the player their stats. */
  get onPhone() {
    return this.phone !== null;
  }

  /** Puts the score on the leaderboard. A player who said no on their phone isn't overruled. */
  async post(by: "host" | "phone"): Promise<RoundResult | null> {
    if (this.status === "posted") return this.saved;
    if (this.status !== "pending" && this.status !== "failed") return null;
    this.set("posting", by);
    try {
      this.saved = await backend.saveRound({ ...this.result, finish: this.result.finish ?? "ended" });
      this.set("posted", by);
      this.letPhoneGo(LINGER_MS);
      return this.saved;
    } catch {
      this.set("failed", by);
      return null;
    }
  }

  /** Not posted (the player's choice on their phone, or the operator moving on). */
  decline(by: "host" | "phone") {
    if (this.status !== "pending" && this.status !== "failed") return;
    this.set("declined", by);
    this.letPhoneGo(LINGER_MS);
  }

  /** Throws the round away; if it was posted, it comes off the leaderboard. */
  discard() {
    if (this.status === "discarded") return;
    if (this.saved?.runId != null) void backend.deleteRun(this.saved.runId).catch(() => {});
    this.saved = null;
    this.set("discarded", "host");
    this.letPhoneGo(LINGER_MS);
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  private set(status: PostStatus, by: "host" | "phone") {
    this.status = status;
    this.by = by;
    this.phone?.link.notify({ type: "post-status", status, rank: this.saved?.rank ?? null, by });
    this.listeners.forEach((cb) => cb());
  }

  private letPhoneGo(afterMs: number) {
    const phone = this.phone;
    if (!phone) return;
    this.phone = null;
    clearTimeout(this.timer);
    window.setTimeout(() => phone.done(), afterMs);
    this.listeners.forEach((cb) => cb());
  }
}

/** The stats as the phone shows them. */
function phoneStats(r: RoundResult): PhoneRoundStats {
  return {
    player: r.player,
    modeLabel: MODE_LABELS[r.mode],
    reps: r.reps,
    attempts: r.attempts,
    perfect: r.perfect,
    noReps: r.noReps,
    durationMs: r.durationMs,
    finishText: FINISH_TEXT[r.finish] ?? "",
  };
}

const posts = new WeakMap<RoundResult, ScorePost>();

/**
 * Starts the post for a round that just ended. Fixed camera: posted at once and
 * the camera stays. Otherwise the round's phone camera (if any) is let go with
 * `release()` and shows the player their stats.
 */
export function startScorePost(result: RoundResult, release: () => ReleasedPhone | null): ScorePost {
  const fixed = isFixedCamera();
  const post = new ScorePost(result, fixed ? null : release(), fixed);
  posts.set(result, post);
  return post;
}

/** The post for a finished round (one without a phone if none was started). */
export function scorePostFor(result: RoundResult): ScorePost {
  let post = posts.get(result);
  if (!post) posts.set(result, (post = new ScorePost(result, null)));
  return post;
}

/** The posts for these rounds, re-rendering whenever one changes. */
export function useScorePosts(results: RoundResult[]): ScorePost[] {
  const list = results.map(scorePostFor);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = list.map((p) => p.subscribe(redraw));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, list);
  return list;
}
