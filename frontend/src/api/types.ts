// TypeScript mirrors of the Rust types the backend sends.
// If you change a struct in backend/src, change it here too.

export type RoundMode = "sprint" | "minute" | "max" | "duel";
export type Category = "thirtySecond" | "oneMinute" | "most";
export type RoundPhase = "idle" | "readyCheck" | "countdown" | "running" | "finished";
export type Referee = "depth" | "lockout" | "plank";

export type SourceSpec =
  | { kind: "mock" }
  | { kind: "phone" }
  | { kind: "pushed" }
  | { kind: "camera"; index: number }
  | { kind: "file"; path: string };

export interface SourceInfo {
  label: string;
  spec: SourceSpec;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface BodyAngles {
  side: "left" | "right";
  elbow: number;
  hip: number;
  knee: number;
  visibility: number;
}

export interface Light {
  referee: Referee;
  pass: boolean;
  measured: number;
  needed: number;
}

export interface RepVerdict {
  attempt: number;
  clean: boolean;
  lights: [Light, Light, Light];
  reasons: string[];
  startMs: number;
  endMs: number;
}

export interface ReadyItem {
  id: string;
  label: string;
  pass: boolean;
  prompt: string | null;
}

export interface SessionSnapshot {
  phase: RoundPhase;
  mode: RoundMode | null;
  player: string | null;
  readyItems: ReadyItem[];
  countdownMs: number | null;
  elapsedMs: number;
  remainingMs: number | null;
  idleRemainingMs: number | null;
  cleanReps: number;
  attempts: number;
  lastRep: RepVerdict | null;
  lockoutThreshold: number | null;
  trackingOk: boolean;
}

export interface Tick {
  width: number;
  height: number;
  landmarks: Landmark[] | null;
  angles: BodyAngles | null;
  fps: number;
  preview: string | null;
  session: SessionSnapshot;
}

export interface NoRepCounts {
  depth: number;
  lockout: number;
  plank: number;
}

export interface RoundResult {
  mode: RoundMode;
  player: string;
  isTeam: boolean;
  cleanReps: number;
  attempts: number;
  accuracy: number;
  noReps: NoRepCounts;
  durationMs: number;
  voided: string | null;
  runId: number | null;
  rank: number | null;
}

export interface LeaderboardRow {
  rank: number;
  runId: number;
  name: string;
  cleanReps: number;
  attempts: number;
  accuracy: number;
  postedAt: number;
}

/** A finished run for the crowd screen's "Recent" list. */
export interface RecentRun {
  runId: number;
  name: string;
  mode: RoundMode;
  cleanReps: number;
  attempts: number;
  accuracy: number;
  noReps: NoRepCounts;
  postedAt: number;
}

/** What the crowd screen shows when no round is running. */
export type CrowdView = { kind: "auto" } | { kind: "board"; category: Category } | { kind: "recent" };

export interface PhoneStatus {
  listening: boolean;
  error: string | null;
  connected: boolean;
  device: string | null;
  width: number;
  height: number;
  fps: number;
}

export interface PhoneLink {
  /** Address the QR code encodes. */
  url: string;
  code: string;
  /** QR code as an SVG string. */
  qrSvg: string;
  status: PhoneStatus;
}

/** Landmarks from a frontend tracker, sent with pushPoseFrame. */
export interface PushedPoseFrame {
  width: number;
  height: number;
  landmarks: Landmark[] | null;
}

export interface SourceStatus {
  running: boolean;
  error: string | null;
}

export interface JudgeConfig {
  depthMaxElbow: number;
  lockoutMinElbow: number;
  plankMinHip: number;
  plankMinKnee: number;
  topExitMargin: number;
  minAttemptDrop: number;
  ascentMargin: number;
  redipMargin: number;
  confirmFrames: number;
  smoothingAlpha: number;
  minVisibility: number;
  trackingLossMs: number;
  startPositionMinElbow: number;
  startHoldMs: number;
  minFps: number;
}
