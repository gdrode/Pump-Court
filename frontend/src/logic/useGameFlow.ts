import { useCallback, useEffect, useState } from "react";
import { backend, errorText, events } from "../api/backend";
import type { RoundResult } from "../api/types";
import type { MenuModeInfo } from "../config/modes";
import { useBackendEvent } from "./events";
import { savedSource } from "./useSettings";

/** One menu choice being played: one turn, or two for a duel. */
export interface Plan {
  mode: MenuModeInfo;
  players: string[];
  isTeam: boolean;
}

/** Which screen the operator window shows, and the data it needs. */
export type FlowState =
  | { screen: "home" }
  | { screen: "names"; mode: MenuModeInfo }
  | { screen: "round"; plan: Plan; results: RoundResult[] }
  | { screen: "results"; plan: Plan; results: RoundResult[] }
  | { screen: "leaderboard" }
  | { screen: "settings" };

/**
 * The operator window's screen-to-screen flow. UI-free: App.tsx maps each
 * `state.screen` to a component and wires these actions to its buttons.
 */
export function useGameFlow() {
  const [state, setState] = useState<FlowState>({ screen: "home" });
  const [sourceError, setSourceError] = useState<string | null>(null);

  // Start the remembered camera (or the mock athlete) on launch.
  useEffect(() => {
    backend.startSource(savedSource()).catch((e) => setSourceError(errorText(e)));
  }, []);
  useBackendEvent(events.onSourceStatus, (s) => setSourceError(s.error));

  const home = useCallback(() => setState({ screen: "home" }), []);

  return {
    state,
    /** Camera problem to show in a banner, or null. */
    sourceError,

    home,
    leaderboard: () => setState({ screen: "leaderboard" }),
    settings: () => setState({ screen: "settings" }),
    openCrowd: () => backend.openCrowdWindow(),

    /** Home → name entry. */
    pickMode: (mode: MenuModeInfo) => setState({ screen: "names", mode }),
    /** Name entry → round. `players` are already validated names. */
    start: (players: string[], isTeam: boolean) =>
      setState((s) => (s.screen === "names" ? { screen: "round", plan: { mode: s.mode, players, isTeam }, results: [] } : s)),
    /** Round → results. */
    finishRound: (result: RoundResult) =>
      setState((s) => (s.screen === "round" ? { screen: "results", plan: s.plan, results: [...s.results, result] } : s)),
    /** Results → next duel turn. */
    nextTurn: () => setState((s) => (s.screen === "results" ? { screen: "round", plan: s.plan, results: s.results } : s)),
    /** Results → same mode and players again. */
    playAgain: () => setState((s) => (s.screen === "results" ? { screen: "round", plan: s.plan, results: [] } : s)),
  };
}

export type GameFlow = ReturnType<typeof useGameFlow>;
