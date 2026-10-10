import { useState } from "react";
import { backend, errorText } from "../api/backend";
import type { EventInfo } from "../api/types";
import { NAME_MAX, TEAM_MAX, type MenuModeInfo } from "../config/modes";
import type { SoloAtEvent } from "./useGameFlow";
import { eventCounts, useEventTeams, type BoardRef } from "./useEvents";

/** Keeps letters, digits, spaces and . _ - ; collapses spaces; max length. */
export function cleanName(raw: string, max = NAME_MAX) {
  return raw.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trimStart().slice(0, max);
}

/**
 * Names for one player, or exactly two for a Duel. The backend has the final
 * say on each name (length and blocklist), so the same rules apply everywhere.
 *
 * A solo round at the active event also asks for the player's role (required
 * when the event has roles and ranks this mode) and team (optional; only when
 * the event has a team leaderboard for this mode). Duels never count for events.
 */
export function useNameEntry(
  mode: MenuModeInfo,
  onStart: (players: string[], event?: SoloAtEvent) => void,
  activeEvent: EventInfo | null = null,
) {
  const [names, setNames] = useState<string[]>(Array(mode.players).fill(""));
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const multi = mode.players > 1;

  const event = !multi && eventCounts(activeEvent, mode.id) ? activeEvent : null;
  const ranked = !!event && event.modes.includes(mode.id);
  const roles = ranked ? event.roles : [];
  const teamBoard = !!event && event.teamModes.includes(mode.id);
  const [role, setRole] = useState<string | null>(null);
  const [team, setTeam] = useState("");
  const teams = useEventTeams(teamBoard ? event.id : null);

  const start = async () => {
    const all = names.map((n) => n.trim());
    const empty = all.findIndex((n) => !n);
    if (empty >= 0) {
      setActive(empty);
      return setError(multi ? `Player ${empty + 1} needs a name` : "Type a name first");
    }
    if (new Set(all.map((n) => n.toLowerCase())).size !== all.length) return setError("The two players need different names");
    if (roles.length > 0 && !(role && roles.includes(role))) return setError("Pick a role (↑ ↓)");
    for (let i = 0; i < all.length; i++) {
      try {
        all[i] = await backend.checkName(all[i]);
      } catch (err) {
        setActive(i);
        return setError(errorText(err));
      }
    }
    if (!event) return onStart(all);
    const board: BoardRef = ranked
      ? { kind: "event", eventId: event.id, mode: mode.id, role: null }
      : { kind: "team", eventId: event.id, mode: mode.id };
    const t = teamBoard ? team.trim() || null : null;
    onStart(all, { tags: { eventId: event.id, role: roles.length ? role : null, team: t }, board });
  };

  return {
    names,
    multi,
    /** The active event this round counts for, or null. */
    event,
    /** Roles to pick from (empty = no role to pick). */
    roles,
    role,
    setRole: (r: string) => {
      setError(null);
      setRole(r);
    },
    /** Next/previous role (↑ ↓). */
    cycleRole: (d: number) => {
      if (!roles.length) return;
      const i = role ? roles.indexOf(role) : d > 0 ? -1 : 0;
      setError(null);
      setRole(roles[(i + d + roles.length) % roles.length]);
    },
    /** The event has a team leaderboard for this mode: ask for a team (optional). */
    teamBoard,
    team,
    setTeam: (v: string) => {
      setError(null);
      setTeam(cleanName(v, TEAM_MAX));
    },
    /** Team names already used at the event. */
    teams,
    teamMax: TEAM_MAX,
    active,
    setActive,
    error,
    maxLength: NAME_MAX,
    setName: (index: number, value: string) => {
      setError(null);
      setNames((ns) => ns.map((old, i) => (i === index ? cleanName(value) : old)));
    },
    /** Enter: jump to the next empty name, or start once everyone has one. */
    enter: () => {
      if (!names[active]?.trim()) return setError(multi ? `Player ${active + 1} needs a name` : "Type a name first");
      const nextEmpty = names.findIndex((n, i) => i !== active && !n.trim());
      if (nextEmpty >= 0) return setActive(nextEmpty);
      void start();
    },
    start,
  };
}
