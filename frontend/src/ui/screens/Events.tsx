import { useState } from "react";
import type { EventInfo } from "../../api/types";
import { MODE_LABELS } from "../../config/modes";
import { EVENT_MODES, useEventDraft } from "../../logic/useEventDraft";
import { useEventManager } from "../../logic/useEvents";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  onBack: () => void;
}

/**
 * Events: pick the active one (new solo rounds count for it), or create and
 * edit them. An event ranks the modes it picks (an "Everyone" board plus one
 * per role) and can have team leaderboards (one per mode).
 */
export function Events({ onBack }: Props) {
  const ev = useEventManager();
  /** null = the list; "new" or an event = the form. */
  const [editing, setEditing] = useState<EventInfo | "new" | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  if (editing) {
    const current = editing === "new" ? null : editing;
    return (
      <EventForm
        key={current?.id ?? "new"}
        editing={current}
        message={ev.message}
        onSave={async (draft) => {
          if (await ev.save(draft)) setEditing(null);
        }}
        onCancel={() => {
          ev.setMessage(null);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <EventList
      list={ev.list}
      activeId={ev.active?.id ?? null}
      deleting={deleting}
      message={ev.message}
      onPick={(id) => {
        setDeleting(null);
        void ev.setActive(id);
      }}
      onNew={() => setEditing("new")}
      onEdit={(e) => setEditing(e)}
      onDelete={(id) => {
        if (deleting !== id) return setDeleting(id);
        setDeleting(null);
        void ev.remove(id);
      }}
      onBack={onBack}
    />
  );
}

function summary(e: EventInfo) {
  const parts = [e.modes.map((m) => MODE_LABELS[m]).join(", ") || "No player boards"];
  if (e.roles.length) parts.push(`${e.roles.length} ${e.roles.length === 1 ? "role" : "roles"}: ${e.roles.join(", ")}`);
  if (e.teamModes.length) parts.push(`Team: ${e.teamModes.map((m) => MODE_LABELS[m]).join(", ")}`);
  return parts.join(" · ");
}

function EventList(props: {
  list: EventInfo[];
  activeId: number | null;
  deleting: number | null;
  message: string | null;
  onPick: (id: number | null) => void;
  onNew: () => void;
  onEdit: (e: EventInfo) => void;
  onDelete: (id: number) => void;
  onBack: () => void;
}) {
  const { list, activeId } = props;
  // ↑ ↓ move through "No event" and the events.
  const ids = [null, ...list.map((e) => e.id)];
  const at = ids.indexOf(activeId);
  useKeys({
    n: props.onNew,
    ArrowUp: () => props.onPick(ids[Math.max(0, at - 1)]),
    ArrowDown: () => props.onPick(ids[Math.min(ids.length - 1, at + 1)]),
    Escape: props.onBack,
    Enter: props.onBack,
  });
  const active = list.find((e) => e.id === activeId);

  return (
    <div className="panel sketch events">
      <div className="players__head">
        <div>
          <p className="eyebrow">Events</p>
          <h1>Which event is on?</h1>
        </div>
        <Dragon action="wave" size="sm" bubble="left" says={host.event(active?.name ?? null)} />
      </div>

      <ul className="event-list" role="radiogroup" aria-label="Active event">
        <li>
          <button
            type="button"
            role="radio"
            aria-checked={activeId === null}
            className={`event-row sketch ${activeId === null ? "is-on" : ""}`}
            onClick={() => props.onPick(null)}
          >
            <span className="event-row__name">No event</span>
            <span className="event-row__blurb">Scores go to the global boards only</span>
          </button>
        </li>
        {list.map((e) => (
          <li key={e.id} className="event-list__item">
            <button
              type="button"
              role="radio"
              aria-checked={e.id === activeId}
              className={`event-row sketch ${e.id === activeId ? "is-on" : ""}`}
              onClick={() => props.onPick(e.id)}
            >
              <span className="event-row__name">{e.name}</span>
              <span className="event-row__blurb">{summary(e)}</span>
            </button>
            <button type="button" className="linkish" onClick={() => props.onEdit(e)}>
              Edit
            </button>
            <button type="button" className={`linkish ${props.deleting === e.id ? "is-bad" : ""}`} onClick={() => props.onDelete(e.id)}>
              {props.deleting === e.id ? "Sure? Delete" : "Delete"}
            </button>
          </li>
        ))}
      </ul>

      {props.deleting !== null && <p className="error">Its scores stay on the global boards. Click Delete again to confirm.</p>}
      {props.message && <p className="error">{props.message}</p>}

      <div className="players__foot">
        <button type="button" className="start-btn sketch" onClick={props.onNew}>
          + New event
        </button>
        <KeyHints
          hints={[
            ["↑↓", "Pick the event"],
            ["N", "New event", props.onNew],
            ["Esc", "Menu", props.onBack],
          ]}
        />
      </div>
    </div>
  );
}

function EventForm(props: {
  editing: EventInfo | null;
  message: string | null;
  onSave: (draft: NonNullable<ReturnType<ReturnType<typeof useEventDraft>["draft"]>>) => void;
  onCancel: () => void;
}) {
  const f = useEventDraft(props.editing);
  const save = () => {
    const d = f.draft();
    if (d) props.onSave(d);
  };
  useKeys({ Escape: props.onCancel });

  return (
    <div className="panel sketch events event-form">
      <div className="players__head">
        <div>
          <p className="eyebrow">{props.editing ? "Edit event" : "New event"}</p>
          <h1>{f.name.trim() || "Name your event"}</h1>
        </div>
      </div>

      <label className="event-pick">
        <span className="event-pick__label">Name</span>
        <input
          className="name-input name-input--sm"
          value={f.name}
          maxLength={f.nameMax}
          placeholder="Event name"
          onChange={(e) => f.setName(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <section className="event-section">
        <h2>Leaderboards</h2>
        <p className="muted">Each mode you pick gets an Everyone board, plus one per role. Duels don't get event boards.</p>
        <div className="chips">
          {EVENT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="switch"
              aria-checked={f.modes.includes(m)}
              className={`chip sketch ${f.modes.includes(m) ? "is-on" : ""}`}
              onClick={() => f.toggleMode(m)}
            >
              {f.modes.includes(m) ? "✓ " : ""}
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </section>

      <section className="event-section">
        <h2>Roles</h2>
        <p className="muted">Players pick one when they type their name; each role gets its own board.</p>
        <div className="chips">
          {f.roles.map((r) => (
            <span key={r} className="chip chip--tag sketch">
              {r}
              <button type="button" className="chip__x" aria-label={`Remove ${r}`} onClick={() => f.removeRole(r)}>
                ×
              </button>
            </span>
          ))}
          <input
            className="name-input name-input--sm event-form__role"
            value={f.roleInput}
            maxLength={f.roleMax}
            placeholder="Add a role"
            onChange={(e) => f.setRoleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                f.addRole();
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="add-player sketch" onClick={f.addRole} disabled={!f.roleInput.trim()}>
            + Add role
          </button>
        </div>
      </section>

      <section className="event-section">
        <h2>Team leaderboards</h2>
        <p className="muted">Pick a game mode. A team's score is its players' best rounds in that mode, added up.</p>
        <div className="chips">
          {f.teamModes.map((m) => (
            <span key={m} className="chip chip--tag sketch">
              Team · {MODE_LABELS[m]}
              <button type="button" className="chip__x" aria-label={`Remove the ${MODE_LABELS[m]} team leaderboard`} onClick={() => f.removeTeamBoard(m)}>
                ×
              </button>
            </span>
          ))}
          {f.freeTeamModes.length > 0 && (
            <>
              <select
                className="event-form__select sketch"
                value={f.teamPick ?? ""}
                onChange={(e) => f.setTeamPick(e.target.value as typeof f.teamModes[number])}
                aria-label="Game mode for the team leaderboard"
              >
                {f.freeTeamModes.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              <button type="button" className="add-player sketch" onClick={f.addTeamBoard}>
                + Create team leaderboard
              </button>
            </>
          )}
        </div>
      </section>

      {(f.error || props.message) && <p className="error">{f.error ?? props.message}</p>}

      <div className="players__foot">
        <button type="button" className="start-btn sketch" onClick={save}>
          {props.editing ? "Save event" : "Create event"}
        </button>
        <KeyHints
          hints={[
            ["Esc", "Cancel", props.onCancel],
          ]}
        />
      </div>
    </div>
  );
}
