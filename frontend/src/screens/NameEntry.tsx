import { useState } from "react";
import { backend, errorText } from "../api/backend";
import type { MenuModeInfo } from "../game/modes";

interface Props {
  mode: MenuModeInfo;
  onStart: (players: string[], isTeam: boolean) => void;
  onBack: () => void;
}

export function NameEntry({ mode, onStart, onBack }: Props) {
  const [names, setNames] = useState<string[]>(Array(mode.players).fill(""));
  const [isTeam, setIsTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const practice = mode.round === "practice";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (practice) return onStart(["Practice"], true);
    try {
      // The backend owns the name rules (length, blocklist).
      const cleaned = await Promise.all(names.map((n) => backend.checkName(n)));
      onStart(cleaned, isTeam);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="screen name-entry" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onBack()}>
      <h2>{mode.title}</h2>
      <p className="muted">{mode.blurb}</p>
      {!practice &&
        names.map((name, i) => (
          <input
            key={i}
            autoFocus={i === 0}
            maxLength={12}
            placeholder={mode.players === 2 ? `Player ${i + 1} name` : "Name"}
            value={name}
            onChange={(e) => {
              const next = [...names];
              next[i] = e.target.value;
              setNames(next);
              setError(null);
            }}
          />
        ))}
      {!practice && (
        <label className="checkbox">
          <input type="checkbox" checked={isTeam} onChange={(e) => setIsTeam(e.target.checked)} />
          Team member (hidden from public ranking)
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" onClick={onBack}>Back (Esc)</button>
        <button type="submit" className="primary" autoFocus={practice}>Start (Enter)</button>
      </div>
    </form>
  );
}
