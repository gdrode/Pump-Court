import type { MenuModeInfo } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useNameEntry } from "../../logic/useNameEntry";

interface Props {
  mode: MenuModeInfo;
  onStart: (players: string[], isTeam: boolean) => void;
  onBack: () => void;
}

export function NameEntry({ mode, onStart, onBack }: Props) {
  const form = useNameEntry(mode, onStart);
  useKeys({ Enter: form.submit, Escape: onBack });

  return (
    <div className="screen name-entry">
      <h2>{mode.title}</h2>
      <p className="muted">{mode.blurb}</p>
      {form.names.map((name, i) => (
        <input
          key={i}
          autoFocus={i === 0}
          maxLength={form.maxLength}
          placeholder={mode.players === 2 ? `Player ${i + 1} name` : "Name"}
          value={name}
          onChange={(e) => form.setName(i, e.target.value)}
        />
      ))}
      <label className="checkbox">
        <input type="checkbox" checked={form.isTeam} onChange={(e) => form.setIsTeam(e.target.checked)} />
        Team member (hidden from public ranking)
      </label>
      {form.error && <p className="error">{form.error}</p>}
      <div className="row">
        <button onClick={onBack}>Back (Esc)</button>
        <button className="primary" onClick={form.submit}>Start (Enter)</button>
      </div>
    </div>
  );
}
