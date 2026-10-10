import { useCallback, useState } from "react";
import { backend } from "../api/backend";
import type { RoundMode, RoundResult } from "../api/types";
import type { MenuModeInfo } from "../config/modes";

/** One menu choice being played: one turn, or two for a Duel. */
export interface Plan {
  mode: MenuModeInfo;
  players: string[];
  /** Duel played side by side on two cameras at once (else the players take turns on one). */
  together?: boolean;
}

/** Which screen the operator window shows, and the data it needs. */
export type FlowState =
  | { screen: "home" }
  | { screen: "names"; mode: MenuModeInfo }
  /** `results` are the finished turns before this one; `attempt` remounts the round on a redo. */
  | { screen: "round"; plan: Plan; results: RoundResult[]; attempt: number }
  | { screen: "results"; plan: Plan; results: RoundResult[] }
  /** Duel side by side: both players at once, one camera each. `attempt` remounts it on a rematch. */
  | { screen: "duelRound"; plan: Plan; attempt: number }
  | { screen: "duelResult"; plan: Plan; results: RoundResult[] }
  /** `mode: null` = the all-time board. */
  | { screen: "leaderboard"; mode: RoundMode | null; highlight?: string }
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

  const home = useCallback(() => setState({ screen: "home" }), []);
  const round = (plan: Plan, results: RoundResult[]) =>
    setState((s) => ({ screen: "round", plan, results, attempt: s.screen === "round" ? s.attempt + 1 : 0 }));

  return {
    state,

    home,
    leaderboard: (mode: RoundMode | null = null, highlight?: string) => setState({ screen: "leaderboard", mode, highlight }),
    settings: () => setState({ screen: "settings" }),
    openCrowd: () => void backend.openCrowdWindow(),

    /** Home → name entry. */
    pickMode: (mode: MenuModeInfo) => setState({ screen: "names", mode }),
    /** Name entry → first round. `players` are already validated names. A Duel starts side by side. */
    start: (players: string[]) =>
      setState((s) => {
        if (s.screen !== "names") return s;
        if (players.length > 1) return { screen: "duelRound", plan: { mode: s.mode, players, together: true }, attempt: 0 };
        return { screen: "round", plan: { mode: s.mode, players }, results: [], attempt: 0 };
      }),
    /** Side-by-side Duel finished (both scores already saved) → who won. */
    finishDuel: (results: RoundResult[]) =>
      setState((s) => (s.screen === "duelRound" ? { screen: "duelResult", plan: s.plan, results } : s)),
    /** Side-by-side Duel → take turns on one camera instead (no second camera). */
    takeTurns: () =>
      setState((s) =>
        s.screen === "duelRound" ? { screen: "round", plan: { ...s.plan, together: false }, results: [], attempt: 0 } : s,
      ),
    /** Round finished → results. */
    finishRound: (result: RoundResult) =>
      setState((s) => (s.screen === "round" ? { screen: "results", plan: s.plan, results: [...s.results, result] } : s)),

    /** Results → next Duel turn, the Duel result, or the leaderboard. */
    post: () => {
      if (state.screen !== "results") return;
      const { plan, results } = state;
      const latest = results[results.length - 1];
      if (results.length < plan.players.length) return round(plan, results);
      if (plan.players.length > 1) return setState({ screen: "duelResult", plan, results });
      setState({ screen: "leaderboard", mode: latest.mode, highlight: latest.player });
    },
    /** Results → throw the score away: solo goes home, a Duel redoes the turn. */
    discard: () => {
      if (state.screen !== "results") return;
      const { plan, results } = state;
      const id = results[results.length - 1]?.runId;
      if (id != null) void backend.deleteRun(id);
      if (plan.players.length > 1) return round(plan, results.slice(0, -1));
      home();
    },
    /** Duel result → same two players again. */
    rematch: () =>
      setState((s) => {
        if (s.screen !== "duelResult") return s;
        if (s.plan.together) return { screen: "duelRound", plan: s.plan, attempt: Date.now() };
        return { screen: "round", plan: s.plan, results: [], attempt: 0 };
      }),
  };
}

export type GameFlow = ReturnType<typeof useGameFlow>;
