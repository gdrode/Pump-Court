import type { Category, RoundMode } from "../api/types";

/** The six modes on the home screen. Duel and Ghost reuse backend round modes. */
export type MenuMode = "sprint" | "minute" | "max" | "duel" | "ghost" | "practice";

export interface MenuModeInfo {
  id: MenuMode;
  key: string; // number key the operator presses
  title: string;
  blurb: string;
  round: RoundMode;
  players: 1 | 2;
}

export const MENU_MODES: MenuModeInfo[] = [
  { id: "sprint", key: "1", title: "Sprint", blurb: "Most clean reps in 30 seconds", round: "sprint", players: 1 },
  { id: "minute", key: "2", title: "Minute", blurb: "Most clean reps in 60 seconds", round: "minute", players: 1 },
  { id: "max", key: "3", title: "Max", blurb: "Untimed. Ends after 5 s without a clean rep", round: "max", players: 1 },
  { id: "duel", key: "4", title: "Duel", blurb: "Two players take turns at Sprint", round: "sprint", players: 2 },
  { id: "ghost", key: "5", title: "Ghost race", blurb: "Race the current Sprint leader", round: "sprint", players: 1 },
  { id: "practice", key: "6", title: "Practice", blurb: "No clock. Live angles and lights", round: "practice", players: 1 },
];

export const CATEGORIES: { id: Category; title: string }[] = [
  { id: "thirtySecond", title: "30-second" },
  { id: "oneMinute", title: "1-minute" },
  { id: "most", title: "Most" },
];

export function categoryOf(mode: RoundMode): Category | null {
  switch (mode) {
    case "sprint":
      return "thirtySecond";
    case "minute":
      return "oneMinute";
    case "max":
      return "most";
    default:
      return null;
  }
}

export function formatSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}
