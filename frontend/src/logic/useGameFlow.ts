import { useCallback, useEffect, useState } from "react";
import { backend, errorText, events } from "../api/backend";
import type { Category, RoundResult } from "../api/types";
import { categoryOf, type MenuModeInfo } from "../config/modes";
import { useBackendEvent } from "./events";
import { savedSource } from "./useSettings";

/** One menu choice being played: one turn, or 2–4 for Versus. */
export interface Plan {
  mode: MenuModeInfo;
  players: string[];
  isTeam: boolean;
}

/** Which screen the operator window shows, and the data it needs. */
export type FlowState =
  | { screen: "home" }
  | { screen: "names"; mode: MenuModeInfo }
  /** `results` are the finished turns before this one; `attempt` remounts the round on a restart. */
  | { screen: "round"; plan: Plan; results: RoundResult[]; attempt: number }
  | { screen: "results"; plan: Plan; results: RoundResult[] }
  | { screen: "versusResult"; plan: Plan; results: RoundResult[] }
  | { screen: "leaderboard"; category: Category; highlight?: string }
  | { screen: "settings" };

/**
 * The operator window's screen-to-screen flow. UI-free: App.tsx maps each
 * `state.screen` to a component and wires these actions to its buttons.
 *
 * Scores are saved by the backend the moment a round ends (so nothing is lost
 * if the laptop crashes). "Post" on the results screen just moves on;
 * "Discard" deletes that saved run.
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
  const round = (plan: Plan, results: RoundResult[]) => setState({ screen: "round", plan, results, attempt: Date.now() });

  /** Deletes the latest turn's saved run, if it was saved. */
  const deleteLatest = (results: RoundResult[]) => {
    const id = results[results.length - 1]?.runId;
    if (id != null) void backend.deleteRun(id);
  };

  return {
    state,
    /** Camera problem to show in a banner, or null. */
    sourceError,

    home,
    leaderboard: (category: Category = "thirtySecond", highlight?: string) =>
      setState({ screen: "leaderboard", category, highlight }),
    settings: () => setState({ screen: "settings" }),
    openCrowd: () => backend.openCrowdWindow(),

    /** Home → name entry. */
    pickMode: (mode: MenuModeInfo) => setState({ screen: "names", mode }),
    /** Name entry → first round. `players` are already validated names. */
    start: (players: string[], isTeam: boolean) =>
      setState((s) => (s.screen === "names" ? { screen: "round", plan: { mode: s.mode, players, isTeam }, results: [], attempt: 0 } : s)),
    /** Round finished (not voided) → results. */
    finishRound: (result: RoundResult) =>
      setState((s) => (s.screen === "round" ? { screen: "results", plan: s.plan, results: [...s.results, result] } : s)),
    /** Voided round → play the same turn again. */
    restartTurn: () => setState((s) => (s.screen === "round" ? { ...s, attempt: s.attempt + 1 } : s)),

    /** Results → next turn, the Versus standings, or the leaderboard. */
    post: () => {
      if (state.screen !== "results") return;
      const { plan, results } = state;
      const latest = results[results.length - 1];
      if (results.length < plan.players.length) return round(plan, results);
      if (plan.players.length > 1) return setState({ screen: "versusResult", plan, results });
      setState({
        screen: "leaderboard",
        category: categoryOf(latest.mode),
        highlight: latest.isTeam || latest.voided ? undefined : latest.player,
      });
    },
    /** Results → throw the score away: solo goes home, Versus redoes the turn. */
    discard: () => {
      if (state.screen !== "results") return;
      const { plan, results } = state;
      deleteLatest(results);
      if (plan.players.length > 1) return round(plan, results.slice(0, -1));
      home();
    },
    /** Versus standings → same players again. */
    rematch: () => setState((s) => (s.screen === "versusResult" ? { screen: "round", plan: s.plan, results: [], attempt: 0 } : s)),
  };
}

export type GameFlow = ReturnType<typeof useGameFlow>;
