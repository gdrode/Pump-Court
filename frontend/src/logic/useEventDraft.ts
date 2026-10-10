import { useState } from "react";
import type { EventDraft, EventInfo, RoundMode } from "../api/types";
import { EVENT_NAME_MAX, ROLE_MAX } from "../config/modes";
import { cleanName } from "./useNameEntry";

/** The modes an event can rank (Duels don't get event boards). */
export const EVENT_MODES: RoundMode[] = ["sprint", "minute", "max"];

/**
 * The create / edit event form: name, which modes get boards, roles, and team
 * leaderboards (one per mode). The backend checks it all again on save.
 */
export function useEventDraft(editing: EventInfo | null) {
  const [name, setName] = useState(editing?.name ?? "");
  const [modes, setModes] = useState<RoundMode[]>(editing?.modes ?? ["sprint"]);
  const [roles, setRoles] = useState<string[]>(editing?.roles ?? []);
  const [roleInput, setRoleInput] = useState("");
  const [teamModes, setTeamModes] = useState<RoundMode[]>(editing?.teamModes ?? []);
  const [teamPick, setTeamPick] = useState<RoundMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const freeTeamModes = EVENT_MODES.filter((m) => !teamModes.includes(m));
  const inOrder = (list: RoundMode[]) => EVENT_MODES.filter((m) => list.includes(m));

  return {
    name,
    setName: (v: string) => {
      setError(null);
      setName(cleanName(v, EVENT_NAME_MAX));
    },
    nameMax: EVENT_NAME_MAX,

    modes,
    toggleMode: (m: RoundMode) => {
      setError(null);
      setModes((ms) => inOrder(ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
    },

    roles,
    roleInput,
    roleMax: ROLE_MAX,
    setRoleInput: (v: string) => {
      setError(null);
      setRoleInput(cleanName(v, ROLE_MAX));
    },
    /** Adds the typed role (Enter in the role box). */
    addRole: () => {
      const r = roleInput.trim();
      if (!r) return;
      if (roles.some((x) => x.toLowerCase() === r.toLowerCase())) return setError(`${r} is already a role`);
      setRoles([...roles, r]);
      setRoleInput("");
    },
    removeRole: (r: string) => setRoles(roles.filter((x) => x !== r)),

    teamModes,
    /** Modes that don't have a team leaderboard yet. */
    freeTeamModes,
    teamPick: teamPick && freeTeamModes.includes(teamPick) ? teamPick : (freeTeamModes[0] ?? null),
    setTeamPick,
    /** "Create team leaderboard" for the picked mode. */
    addTeamBoard: () => {
      const m = teamPick && freeTeamModes.includes(teamPick) ? teamPick : freeTeamModes[0];
      if (m) setTeamModes(inOrder([...teamModes, m]));
    },
    removeTeamBoard: (m: RoundMode) => setTeamModes(teamModes.filter((x) => x !== m)),

    error,
    setError,
    /** The draft to save, or null (with `error` set) if it isn't ready. */
    draft: (): EventDraft | null => {
      if (!name.trim()) {
        setError("Give the event a name");
        return null;
      }
      if (!modes.length && !teamModes.length) {
        setError("Pick at least one game mode or create a team leaderboard");
        return null;
      }
      const pending = roleInput.trim();
      const all = pending && !roles.some((x) => x.toLowerCase() === pending.toLowerCase()) ? [...roles, pending] : roles;
      return { id: editing?.id ?? null, name: name.trim(), modes, roles: all, teamModes };
    },
  };
}
