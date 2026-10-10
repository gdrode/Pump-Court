// Game content shown in the UI: menu modes, leaderboard tabs, labels, keys.
// Edit text and keys here; screens read them, so nothing else changes.

import { DIFFICULTY, LIGHT_LABEL, LIGHTS, type Light } from "@tracker/judge";
import type { RoundMode } from "../api/types";

/**
 * The competition rules: the tracker's "normal" referee, fixed for everyone.
 * 2 or 3 white lights = a valid push-up; 3 = perfect. See
 * docs/features/referee-engine/README.md.
 */
export const REFEREE_RULES = DIFFICULTY.normal;

/** The three referee lights, in display order, with their names. */
export const REFEREES: Light[] = LIGHTS;
export const REFEREE_LABELS: Record<Light, string> = LIGHT_LABEL;

export interface MenuModeInfo {
  id: RoundMode;
  /** Key the operator presses on the home screen. */
  key: string;
  title: string;
  blurb: string;
  /** 2 for a Duel, 1 for Singleplayer. */
  players: 1 | 2;
  /** Small red note under the blurb. */
  note?: string;
}

/** Top bar of the home screen: who's playing. */
export type PlayStyle = "single" | "duel";

export const PLAY_STYLES: { id: PlayStyle; title: string; blurb: string }[] = [
  { id: "single", title: "Singleplayer", blurb: "One player" },
  { id: "duel", title: "Duel", blurb: "Two players, two cameras" },
];

/** The game modes under the top bar. Each works for Singleplayer and Duel. */
export type GameModeId = "sprint" | "minute" | "max";

export interface GameModeInfo {
  id: GameModeId;
  /** Key the operator presses on the home screen. */
  key: string;
  title: string;
  /** Same words for Singleplayer and Duel. */
  blurb: string;
  note?: string;
}

/** Marathon is stored as "minute" (its id and leaderboard name in the database). */
export const GAME_MODES: GameModeInfo[] = [
  { id: "sprint", key: "1", title: "Sprint", blurb: "30 seconds. Most push-ups wins." },
  { id: "minute", key: "2", title: "Marathon", blurb: "60 seconds. Most push-ups wins." },
  { id: "max", key: "3", title: "Max", blurb: "No time limit. Go until you fail." },
];

/**
 * What gets played for a home-screen pick. A Duel is played side by side on
 * two cameras (or as two turns on one camera, if the operator picks that).
 * Duel + Sprint keeps the backend's "duel" mode (its own leaderboard); Duel +
 * Marathon or Max is saved to that mode's board.
 */
export function menuMode(style: PlayStyle, mode: GameModeInfo): MenuModeInfo {
  if (style === "single") return { id: mode.id, key: mode.key, title: mode.title, blurb: mode.blurb, players: 1, note: mode.note };
  return {
    id: mode.id === "sprint" ? "duel" : mode.id,
    key: mode.key,
    title: `Duel · ${mode.title}`,
    blurb: mode.blurb,
    players: 2,
    note: mode.note,
  };
}

/** How each mode is named on boards and results. */
export const MODE_LABELS: Record<RoundMode, string> = {
  sprint: "Sprint",
  minute: "Marathon",
  max: "Max",
  duel: "Duel",
};

/** Leaderboard tabs. `mode: null` = every mode: the all-time board. */
export const BOARDS: { mode: RoundMode | null; title: string }[] = [
  { mode: null, title: "All time" },
  { mode: "sprint", title: "Sprint" },
  { mode: "minute", title: "Marathon" },
  { mode: "max", title: "Max" },
  { mode: "duel", title: "Duel" },
];

/** Global operator shortcuts on the home screen. */
export const HOME_KEYS = { leaderboard: "l", settings: "s", crowd: "w", single: "ArrowLeft", duel: "ArrowRight", event: "e", fixedCamera: "f" } as const;

export const NAME_MAX = 12;
/** Same limits as backend/src/events.rs. */
export const TEAM_MAX = 16;
export const ROLE_MAX = 16;
export const EVENT_NAME_MAX = 24;

/** How long the crowd screen celebrates a newly posted score. */
export const CROWD_POSTED_MS = 8000;
/** Rows on the crowd screen's all-time board. */
export const CROWD_ROWS = 10;
/** During an event, the crowd screen shows each of its boards for this long. */
export const CROWD_BOARD_MS = 10_000;

/** m:ss, for untimed rounds. */
export function formatElapsed(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
