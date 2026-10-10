// TypeScript mirrors of the Rust types the backend sends.
// If you change a struct in backend/src, change it here too.

/** backend/src/game/mode.rs `RoundMode`. */
export type RoundMode = "sprint" | "minute" | "max" | "duel";
/** backend/src/game/session.rs `RoundPhase`. */
export type RoundPhase = "idle" | "getReady" | "countdown" | "running" | "finished";

/** One white (true) or red (false) light per rule. Same names as the tracker's `Light`. */
export interface Lights {
  depth: boolean;
  torso: boolean;
  lockout: boolean;
}

/** A rep the tracker judged, sent with `reportRep`. */
export interface RepReport {
  /** 2 or 3 white lights. */
  counted: boolean;
  /** 3 white lights. */
  perfect: boolean;
  lights: Lights;
  /** Why each red light was given. */
  faults: string[];
}

/** A rep the backend counted into the round (`rep` event). */
export interface RepVerdict {
  /** 1 for the first attempt of the round. */
  attempt: number;
  counted: boolean;
  perfect: boolean;
  lights: Lights;
  faults: string[];
}

/** Red lights per rule over a round. */
export interface NoRepCounts {
  depth: number;
  torso: number;
  lockout: number;
}

/** Why a round ended. backend/src/game/session.rs `FinishReason`; same names as the tracker's game.ts. */
export type FinishReason = "time" | "stopped" | "stuck" | "left" | "ended";

/**
 * A finished round (`round-finished` event). Not saved yet: `runId` and `rank`
 * are null until it is posted (`save_round`, which emits `round-posted`).
 */
export interface RoundResult {
  mode: RoundMode;
  player: string;
  /** Valid push-ups (2–3 white lights). */
  reps: number;
  attempts: number;
  perfect: number;
  noReps: NoRepCounts;
  durationMs: number;
  finish: FinishReason;
  /** Database id, or null if saving failed. */
  runId: number | null;
  /** Player's place on this mode's board. */
  rank: number | null;
}

/** A finished round to post to the leaderboard (`save_round`). backend/src/leaderboard.rs `FinishedRound`. */
export interface FinishedRound {
  mode: RoundMode;
  player: string;
  reps: number;
  attempts: number;
  perfect: number;
  noReps: NoRepCounts;
  durationMs: number;
  finish: FinishReason;
}

/** The round right now (`tick` event, about 10 times a second during a round). */
export interface SessionSnapshot {
  phase: RoundPhase;
  mode: RoundMode | null;
  player: string | null;
  /** The tracker's posture check says the player is holding the top position. */
  inPosition: boolean;
  countdownMs: number | null;
  elapsedMs: number;
  /** Time left (Sprint, Minute, Duel); null for Max (no time limit). */
  remainingMs: number | null;
  /** While running: time left before the player fails (stuck in a rep, or no push-up in time). */
  failRemainingMs: number | null;
  reps: number;
  attempts: number;
  perfect: number;
  lastRep: RepVerdict | null;
}

/** One player's best round. The database keeps only name, mode and reps. */
export interface LeaderboardRow {
  rank: number;
  runId: number;
  name: string;
  mode: RoundMode;
  reps: number;
}

// --- Phone cameras (backend/src/phone) ------------------------------------------

export interface LanAddress {
  address: string;
  /** Network adapter name, e.g. "en0". */
  iface: string;
  /** Plain-words kind, e.g. "Wi-Fi", "hotspot". */
  label: string;
}

/** This laptop's addresses for the pairing QR code, best first. */
export interface LanInfo {
  addresses: LanAddress[];
  /** macOS Bonjour name, e.g. "Alexs-MacBook.local". */
  bonjour: string | null;
  /** HTTPS port the phone page is served on (47800). */
  port: number;
  /** The phone server could not start. */
  error: string | null;
}

/** The "Any network" link (Cloudflare quick tunnel). */
export interface TunnelStatus {
  status: "off" | "starting" | "on" | "error" | "missing";
  url: string | null;
  error: string | null;
}

/** Messages for the laptop's side of a pairing room (`phoneOpen` events). */
export type PhoneRoomMessage =
  | { type: "joined" }
  | { type: "peer-joined" }
  | { type: "peer-left" }
  | { type: "error"; message: string }
  | { type: "signal"; data: SignalData }
  | { type: "phone-visit"; from: string }
  /** Any network: the phone says which way to turn its picture (clockwise degrees). */
  | { type: "orientation"; rotation: number }
  /** Any network, after a round: the player's choice on the phone to post the score. */
  | { type: "post"; post: boolean };

/**
 * Passed between phone and laptop through the room: WebRTC offer/answer, ICE
 * candidate, or (phone → laptop) the clockwise turn that makes the picture
 * upright, or the player's choice to post their score.
 */
export type SignalData =
  | { sdp: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit }
  | { orientation: number }
  | { post: boolean };

/** Laptop → phone notes (`phoneNotify`): pumpCourt/src/phone/protocol.ts `PhoneNote`. */
export type { PhoneNote, PhoneRoundStats, PostStatus } from "@tracker/phone/protocol";
