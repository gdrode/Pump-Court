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
  /** Duel is 2 players; the rest are solo. */
  players: 1 | 2;
  /** Small red note under the blurb. */
  note?: string;
}

export const MENU_MODES: MenuModeInfo[] = [
  { id: "sprint", key: "1", title: "Sprint", blurb: "Most push-ups in 30 seconds", players: 1 },
  { id: "minute", key: "2", title: "Minute", blurb: "Most push-ups in 60 seconds", players: 1 },
  {
    id: "max",
    key: "3",
    title: "Max",
    blurb: "Untimed. Ends after 5 s without a valid push-up",
    players: 1,
    note: "only when nobody is queuing",
  },
  { id: "duel", key: "4", title: "Duel", blurb: "2 players, 30 seconds each. Most push-ups wins", players: 2 },
];

/** How each mode is named on boards and results. */
export const MODE_LABELS: Record<RoundMode, string> = {
  sprint: "Sprint",
  minute: "Minute",
  max: "Max",
  duel: "Duel",
};

/** Leaderboard tabs. `mode: null` = every mode: the all-time board. */
export const BOARDS: { mode: RoundMode | null; title: string }[] = [
  { mode: null, title: "All time" },
  { mode: "sprint", title: "Sprint" },
  { mode: "minute", title: "Minute" },
  { mode: "max", title: "Max" },
  { mode: "duel", title: "Duel" },
];

/** Global operator shortcuts on the home screen. */
export const HOME_KEYS = { leaderboard: "l", settings: "s", crowd: "w" } as const;

export const NAME_MAX = 12;

/** How long the crowd screen celebrates a newly posted score. */
export const CROWD_POSTED_MS = 8000;
/** Rows on the crowd screen's all-time board. */
export const CROWD_ROWS = 10;

/** m:ss, for untimed rounds. */
export function formatElapsed(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
