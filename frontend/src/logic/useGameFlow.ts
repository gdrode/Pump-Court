import { useCallback, useRef, useState } from "react";
import { backend } from "../api/backend";
import type { EventTags, RoundResult } from "../api/types";
import type { MenuModeInfo } from "../config/modes";
import type { BoardRef } from "./useEvents";

/** One menu choice being played: one turn, or two for a Duel. */
export interface Plan {
  mode: MenuModeInfo;
  players: string[];
  /** Duel played side by side on two cameras at once (else the players take turns on one). */
  together?: boolean;
  /** Solo at the active event: the player's role and team, and the board to show once posted. */
  event?: SoloAtEvent;
}

export interface SoloAtEvent {
  tags: EventTags;
  board: BoardRef;
}

/** Which screen the operator window shows, and the data it needs. */
export type FlowState =
  /** `visit` counts trips to the menu (the dragon says a new line each time). */
  | { screen: "home"; visit: number }
  | { screen: "names"; mode: MenuModeInfo }
  /** `results` are the finished turns before this one; `attempt` remounts the round on a redo. */
  | { screen: "round"; plan: Plan; results: RoundResult[]; attempt: number }
  | { screen: "results"; plan: Plan; results: RoundResult[] }
  /** Duel side by side: both players at once, one camera each. `attempt` remounts it on a rematch. */
  | { screen: "duelRound"; plan: Plan; attempt: number }
  | { screen: "duelResult"; plan: Plan; results: RoundResult[] }
  | { screen: "leaderboard"; board: BoardRef; highlight?: string }
  /** Create, edit and pick events. */
  | { screen: "events" }
  | { screen: "settings" };

/**
 * The operator window's screen-to-screen flow. UI-free: App.tsx maps each
 * `state.screen` to a component and wires these actions to its buttons.
 *
 * Posting is opt-in (logic/scorePost.ts): a score goes on the leaderboard only
 * when the operator posts it on the results screen or the player taps "Post my
 * score" on their phone. The screens post or discard; these actions only move
 * between screens.
 */
export function useGameFlow() {
  const [state, setState] = useState<FlowState>({ screen: "home", visit: 0 });
  // Counted here, in the action (not in a state updater, which React may run twice).
  const visits = useRef(0);
  const home = useCallback(() => {
    visits.current += 1;
    setState({ screen: "home", visit: visits.current });
  }, []);
  const round = (plan: Plan, results: RoundResult[]) =>
    setState((s) => ({ screen: "round", plan, results, attempt: s.screen === "round" ? s.attempt + 1 : 0 }));

  return {
    state,

    home,
    leaderboard: (board: BoardRef = { kind: "global", mode: null }, highlight?: string) =>
      setState({ screen: "leaderboard", board, highlight }),
    events: () => setState({ screen: "events" }),
    settings: () => setState({ screen: "settings" }),
    openCrowd: () => void backend.openCrowdWindow(),

    /** Home → name entry. */
    pickMode: (mode: MenuModeInfo) => setState({ screen: "names", mode }),
    /**
     * Name entry → first round. `players` are already validated names. A Duel
     * starts side by side. `event`: a solo round at the active event.
     */
    start: (players: string[], event?: SoloAtEvent) =>
      setState((s) => {
        if (s.screen !== "names") return s;
        if (players.length > 1) return { screen: "duelRound", plan: { mode: s.mode, players, together: true }, attempt: 0 };
        return { screen: "round", plan: { mode: s.mode, players, event }, results: [], attempt: 0 };
      }),
    /** Side-by-side Duel finished → who won (and posting the two scores). */
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

    /**
     * Results → next Duel turn, the Duel result, or (solo) the leaderboard if
     * the score was posted (the event's board for a round at an event), else home.
     */
    next: (posted: boolean) => {
      if (state.screen !== "results") return;
      const { plan, results } = state;
      const latest = results[results.length - 1];
      if (results.length < plan.players.length) return round(plan, results);
      if (plan.players.length > 1) return setState({ screen: "duelResult", plan, results });
      const board: BoardRef = plan.event?.board ?? { kind: "global", mode: latest.mode };
      if (posted) setState({ screen: "leaderboard", board, highlight: latest.player });
      else home();
    },
    /** Results → the score was thrown away: solo goes home, a Duel redoes the turn. */
    discard: () => {
      if (state.screen !== "results") return;
      const { plan, results } = state;
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
