// Game content shown in the UI: menu modes, leaderboard tabs, labels, keys.
// Edit text and keys here; screens read them, so nothing else changes.

import type { Category, Referee, RoundMode } from "../api/types";

/** Modes on the home screen. Versus is 2–4 players taking turns at a 30 s round. */
export type MenuMode = "sprint" | "minute" | "max" | "versus";

export interface MenuModeInfo {
  id: MenuMode;
  /** Key the operator presses on the home screen. */
  key: string;
  title: string;
  blurb: string;
  /** The backend round each turn plays. */
  round: RoundMode;
  minPlayers: number;
  maxPlayers: number;
  /** Small red note under the blurb. */
  note?: string;
}

export const MENU_MODES: MenuModeInfo[] = [
  { id: "sprint", key: "1", title: "Sprint", blurb: "Most clean reps in 30 seconds", round: "sprint", minPlayers: 1, maxPlayers: 1 },
  { id: "minute", key: "2", title: "Minute", blurb: "Most clean reps in 60 seconds", round: "minute", minPlayers: 1, maxPlayers: 1 },
  {
    id: "max",
    key: "3",
    title: "Max",
    blurb: "Untimed. Ends after 5 s without a clean rep",
    round: "max",
    minPlayers: 1,
    maxPlayers: 1,
    note: "only when nobody is queuing",
  },
  { id: "versus", key: "4", title: "Versus", blurb: "2–4 players take turns. Most clean reps wins", round: "duel", minPlayers: 2, maxPlayers: 4 },
];

export const CATEGORIES: { id: Category; title: string }[] = [
  { id: "thirtySecond", title: "30-second" },
  { id: "oneMinute", title: "1-minute" },
  { id: "most", title: "Most" },
];

export function categoryOf(mode: RoundMode): Category {
  return mode === "minute" ? "oneMinute" : mode === "max" ? "most" : "thirtySecond";
}

/** How each round mode is named in result lists (crowd "Recent", results). */
export const MODE_LABELS: Record<RoundMode, string> = {
  sprint: "Sprint",
  minute: "Minute",
  max: "Max",
  duel: "Versus",
};

/** Round length in ms, for the clock (Max shows elapsed time instead). */
export const ROUND_MS: Record<RoundMode, number | null> = { sprint: 30_000, minute: 60_000, max: null, duel: 30_000 };

/** Views the crowd screen can show when no round is running. */
export type CrowdPage = { kind: "board"; category: Category; title: string } | { kind: "recent"; title: string };

export const CROWD_PAGES: CrowdPage[] = [
  ...CATEGORIES.map((c) => ({ kind: "board" as const, category: c.id, title: c.title })),
  { kind: "recent", title: "Recent" },
];

/** Keys on the crowd window (and the operator's crowd controls). */
export const CROWD_KEYS = { auto: "a", recent: "r", boards: ["1", "2", "3"] } as const;

export const REFEREES: Referee[] = ["depth", "lockout", "plank"];
export const REFEREE_LABELS: Record<Referee, string> = { depth: "Depth", lockout: "Lockout", plank: "Plank" };
/** How a referee's threshold reads on screen: depth passes at or below, the others at or above. */
export const REF_COMPARATOR: Record<Referee, "≤" | "≥"> = { depth: "≤", lockout: "≥", plank: "≥" };

/** Global operator shortcuts on the home screen. */
export const HOME_KEYS = { leaderboard: "l", settings: "s", crowd: "w" } as const;

export const NAME_MAX = 12;

/** How long the idle crowd screen shows each page. */
export const CROWD_CYCLE_MS = 9000;
/** How long the crowd screen celebrates a newly posted score. */
export const CROWD_POSTED_MS = 8000;

export function formatSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

/** m:ss, for untimed rounds. */
export function formatElapsed(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Sat 2:05 PM" for leaderboard rows (postedAt is Unix ms). */
export function formatPosted(ms: number): string {
  return new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}
