import { useCallback, useEffect, useState } from "react";
import { backend, errorText, events } from "../api/backend";
import type { EventDraft, EventInfo, LeaderboardRow, RoundMode, TeamRow } from "../api/types";
import { useBackendEvent } from "./events";

/**
 * Events (backend/src/events.rs): a named contest with its own boards. Each
 * picked mode has an "Everyone" board plus one per role; team leaderboards add
 * up the members' bests. Solo rounds at the active event are posted with the
 * player's role and team (`EventTags`). Duels never get event boards.
 */

/** Every event, and the active one. Updates when any window changes them. */
export function useEvents() {
  const [list, setList] = useState<EventInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    backend
      .listEvents()
      .then(setList)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(reload, [reload]);
  useBackendEvent(events.onEventChanged, reload);
  return { list, active: list.find((e) => e.active) ?? null, loaded, reload };
}

/** The active event, or null. */
export function useActiveEvent(): EventInfo | null {
  return useEvents().active;
}

/** Does a solo round in this mode count for the event (an individual or a team board)? */
export function eventCounts(event: EventInfo | null, mode: RoundMode): event is EventInfo {
  return !!event && (event.modes.includes(mode) || event.teamModes.includes(mode));
}

/** One board: global (a mode, or null for all time), an event's (everyone or one role), or a team board. */
export type BoardRef =
  | { kind: "global"; mode: RoundMode | null }
  | { kind: "event"; eventId: number; mode: RoundMode; role: string | null }
  | { kind: "team"; eventId: number; mode: RoundMode };

export interface BoardRows {
  players: LeaderboardRow[];
  teams: TeamRow[];
}

export function fetchBoard(board: BoardRef, limit: number): Promise<BoardRows> {
  const players = (p: Promise<LeaderboardRow[]>) => p.then((rows) => ({ players: rows, teams: [] }));
  switch (board.kind) {
    case "global":
      return players(backend.getLeaderboard(board.mode, limit));
    case "event":
      return players(backend.getEventBoard(board.eventId, board.mode, board.role, limit));
    case "team":
      return backend.getTeamBoard(board.eventId, board.mode, limit).then((rows) => ({ players: [], teams: rows }));
  }
}

/** The event's boards to pick from: one per mode (the role is picked apart), then the team boards. */
export function eventTabs(event: EventInfo): BoardRef[] {
  return [
    ...event.modes.map((mode): BoardRef => ({ kind: "event", eventId: event.id, mode, role: null })),
    ...event.teamModes.map((mode): BoardRef => ({ kind: "team", eventId: event.id, mode })),
  ];
}

/** Every board of an event, each role on its own (what the crowd screen cycles through). */
export function allEventBoards(event: EventInfo): BoardRef[] {
  return [
    ...event.modes.flatMap((mode) =>
      [null, ...event.roles].map((role): BoardRef => ({ kind: "event", eventId: event.id, mode, role })),
    ),
    ...event.teamModes.map((mode): BoardRef => ({ kind: "team", eventId: event.id, mode })),
  ];
}

/** Same board, ignoring the role. */
export function sameTab(a: BoardRef, b: BoardRef) {
  return a.kind === b.kind && a.mode === b.mode && (a.kind === "global" || a.eventId === (b as { eventId: number }).eventId);
}

/** The event screen: list, active event, create, edit, delete. */
export function useEventManager() {
  const { list, active, loaded, reload } = useEvents();
  const [message, setMessage] = useState<string | null>(null);
  const run = async <T,>(work: () => Promise<T>): Promise<T | null> => {
    setMessage(null);
    try {
      const out = await work();
      reload();
      return out;
    } catch (e) {
      setMessage(errorText(e));
      return null;
    }
  };
  return {
    list,
    active,
    loaded,
    message,
    setMessage,
    setActive: (id: number | null) => run(() => backend.setActiveEvent(id)),
    /** Returns the saved event, or null (the reason is in `message`). */
    save: (draft: EventDraft) => run(() => backend.saveEvent(draft)),
    remove: (id: number) => run(() => backend.deleteEvent(id)),
  };
}

/** Team names already used at the event, for the name screen's suggestions. */
export function useEventTeams(eventId: number | null) {
  const [teams, setTeams] = useState<string[]>([]);
  useEffect(() => {
    if (eventId === null) return setTeams([]);
    let alive = true;
    backend
      .getEventTeams(eventId)
      .then((t) => alive && setTeams(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [eventId]);
  return teams;
}

