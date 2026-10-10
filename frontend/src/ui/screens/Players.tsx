import { useEffect, useRef } from "react";
import type { MenuModeInfo } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useNameEntry } from "../../logic/useNameEntry";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  mode: MenuModeInfo;
  onStart: (players: string[], isTeam: boolean) => void;
  onBack: () => void;
}

/** "Who's playing?": a name for a solo round, or 2–4 players for Versus. */
export function Players({ mode, onStart, onBack }: Props) {
  const form = useNameEntry(mode, onStart);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[form.active]?.focus();
  }, [form.active, form.names.length]);

  useKeys({ Enter: form.enter, Escape: onBack, "Alt+n": form.addPlayer, "Alt+t": form.toggleTeam });

  return (
    <div className={`panel sketch players ${form.multi ? "players--multi" : ""}`}>
      <div className="players__head">
        <div>
          <p className="eyebrow">{mode.title}</p>
          <h1>{form.multi ? "Who's playing?" : "Your name"}</h1>
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
              autoComplete="off"
              spellCheck={false}
              aria-label={form.multi ? `Player ${i + 1} name` : "Your name"}
            />
            <span className="player__count">
              {n.length}/{form.maxLength}
            </span>
            {form.multi && form.canRemove && (
              <button type="button" className="player__remove" onClick={() => form.removePlayer(i)} aria-label={`Remove player ${i + 1}`}>
                ×
              </button>
            )}
          </li>
        ))}
      </ol>

      {form.multi && form.canAdd && (
        <button type="button" className="add-player sketch" onClick={form.addPlayer}>
          + Add player <kbd>Alt+N</kbd>
        </button>
      )}

      <div className="options">
        <label className="option check">
          <input type="checkbox" checked={form.isTeam} onChange={(e) => form.setIsTeam(e.target.checked)} />
          Team member {form.multi ? "runs" : "run"} (hidden from the public board) <kbd>Alt+T</kbd>
        </label>
      </div>

      {form.error && <p className="error">{form.error}</p>}

      <div className="players__foot">
        <button type="button" className="start-btn sketch" onClick={() => void form.start()}>
          {form.multi ? `Start with ${form.names.length} players` : "Let's go!"}
        </button>
        <KeyHints
          hints={[
            ["Enter", form.multi ? "Next / start" : "Start", () => void form.start()],
            ["Esc", "Back", onBack],
          ]}
        />
      </div>
    </div>
  );
}
