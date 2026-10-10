// Game content shown in the UI: menu modes, leaderboard tabs, key bindings.
// Edit text and keys here; screens read them, so nothing else changes.

import type { Category, RoundMode } from "../api/types";

/** Modes on the home screen. Duel is two Sprint turns. */
export type MenuMode = "sprint" | "minute" | "max" | "duel";

export interface MenuModeInfo {
  id: MenuMode;
  /** Key the operator presses on the home screen. */
  key: string;
  title: string;
  blurb: string;
  /** The backend round each turn plays. */
  round: RoundMode;
  players: 1 | 2;
}

export const MENU_MODES: MenuModeInfo[] = [
  { id: "sprint", key: "1", title: "Sprint", blurb: "Most clean reps in 30 seconds", round: "sprint", players: 1 },
  { id: "minute", key: "2", title: "Minute", blurb: "Most clean reps in 60 seconds", round: "minute", players: 1 },
  { id: "max", key: "3", title: "Max", blurb: "Untimed. Ends after 5 s without a clean rep", round: "max", players: 1 },
  { id: "duel", key: "4", title: "Duel", blurb: "Two players take turns at Sprint", round: "duel", players: 2 },
];

export const CATEGORIES: { id: Category; title: string }[] = [
  { id: "thirtySecond", title: "30-second" },
  { id: "oneMinute", title: "1-minute" },
  { id: "most", title: "Most" },
];

/** How each mode is named in result lists (crowd "Recent"). */
export const MODE_LABELS: Record<RoundMode, string> = {
  sprint: "Sprint",
  minute: "Minute",
  max: "Max",
  duel: "Duel",
};

/** Views the crowd screen can show when no round is running. */
export type CrowdPage = { kind: "board"; category: Category; title: string } | { kind: "recent"; title: string };

export const CROWD_PAGES: CrowdPage[] = [
  ...CATEGORIES.map((c) => ({ kind: "board" as const, category: c.id, title: c.title })),
  { kind: "recent", title: "Recent" },
];

/** Keys on the crowd window (and the operator's crowd controls). */
export const CROWD_KEYS = { auto: "a", recent: "r", boards: ["1", "2", "3"] } as const;

export const REFEREE_LABELS = { depth: "Depth", lockout: "Lockout", plank: "Plank" } as const;

/** Global operator shortcuts on the home screen. */
export const HOME_KEYS = { leaderboard: "l", settings: "s", crowd: "c" } as const;

/** How long the idle crowd screen shows each leaderboard tab. */
export const CROWD_CYCLE_MS = 8000;

export function formatSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}
