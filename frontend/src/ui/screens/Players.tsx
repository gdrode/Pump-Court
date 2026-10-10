import { useEffect, useRef } from "react";
import type { MenuModeInfo } from "../../config/modes";
import { useActiveEvent } from "../../logic/useEvents";
import type { SoloAtEvent } from "../../logic/useGameFlow";
import { useKeys } from "../../logic/useKeys";
import { useNameEntry } from "../../logic/useNameEntry";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  mode: MenuModeInfo;
  onStart: (players: string[], event?: SoloAtEvent) => void;
  onBack: () => void;
}

/**
 * "Who's playing?": one name, or two for a Duel. At an event (solo only): the
 * player's role and, if the event has a team leaderboard for this mode, team.
 */
export function Players({ mode, onStart, onBack }: Props) {
  const form = useNameEntry(mode, onStart, useActiveEvent());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[form.active]?.focus();
  }, [form.active]);

  useKeys({ Enter: form.enter, Escape: onBack });
  // ↑ ↓ pick the role, even while typing the name.
  const roleKeys = (e: React.KeyboardEvent) => {
    if (!form.roles.length || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    form.cycleRole(e.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <div className={`panel sketch players ${form.multi ? "players--multi" : ""}`}>
      <div className="players__head">
        <div>
          <p className="eyebrow">
            {mode.title}
            {form.event && ` · ${form.event.name}`}
          </p>
          <h1>{form.multi ? "Who's duelling?" : "Your name"}</h1>
        </div>
        <Dragon action="wave" size="sm" bubble="left" says={host.who(form.multi)} />
      </div>

      <ol className="player-list">
        {form.names.map((n, i) => (
          <li key={i} className={`player player--${i + 1} ${i === form.active ? "is-active" : ""}`}>
            {form.multi && <span className="player__badge sketch">P{i + 1}</span>}
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              className="name-input"
              value={n}
              maxLength={form.maxLength}
              placeholder={form.multi ? `Player ${i + 1}` : "Name"}
              onChange={(e) => form.setName(i, e.target.value)}
              onFocus={() => form.setActive(i)}
              onKeyDown={roleKeys}
              autoComplete="off"
              spellCheck={false}
              aria-label={form.multi ? `Player ${i + 1} name` : "Your name"}
            />
            <span className="player__count">
              {n.length}/{form.maxLength}
            </span>
          </li>
        ))}
      </ol>

      {form.roles.length > 0 && (
        <div className="event-pick">
          <span className="event-pick__label">Role</span>
          <div className="chips" role="radiogroup" aria-label="Role">
            {form.roles.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={form.role === r}
                className={`chip sketch ${form.role === r ? "is-on" : ""}`}
                onClick={() => form.setRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {form.teamBoard && (
        <label className="event-pick">
          <span className="event-pick__label">Team</span>
          <input
            className="name-input name-input--sm"
            value={form.team}
            maxLength={form.teamMax}
            placeholder="Team name (optional)"
            list="event-teams"
            onChange={(e) => form.setTeam(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="event-teams">
            {form.teams.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      )}

      {form.error && <p className="error">{form.error}</p>}

      <div className="players__foot">
        <button type="button" className="start-btn sketch" onClick={() => void form.start()}>
          {form.multi ? "Start the duel" : "Let's go!"}
        </button>
        <KeyHints
          hints={[
            ["Enter", form.multi ? "Next / start" : "Start", form.enter],
            ...(form.roles.length > 0 ? [["↑↓", "Role"] as [string, string]] : []),
            ["Esc", "Back", onBack],
          ]}
        />
      </div>
    </div>
  );
}
