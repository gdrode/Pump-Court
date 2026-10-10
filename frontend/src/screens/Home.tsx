import { useEffect } from "react";
import { MENU_MODES, type MenuModeInfo } from "../game/modes";

interface Props {
  onPick: (mode: MenuModeInfo) => void;
  onLeaderboard: () => void;
  onSettings: () => void;
  onCrowd: () => void;
}

/** Operator menu. Number keys pick a mode so the player can stay on the mat. */
export function Home({ onPick, onLeaderboard, onSettings, onCrowd }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Stop the key press from also typing into the next screen's input.
      if (/^[1-6lsc]$/i.test(e.key)) e.preventDefault();
      const mode = MENU_MODES.find((m) => m.key === e.key);
      if (mode) onPick(mode);
      else if (e.key.toLowerCase() === "l") onLeaderboard();
      else if (e.key.toLowerCase() === "s") onSettings();
      else if (e.key.toLowerCase() === "c") onCrowd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick, onLeaderboard, onSettings, onCrowd]);

  return (
    <div className="screen home">
      <h1>Pump Court</h1>
      <p className="muted">Three white lights or it didn't happen.</p>
      <div className="mode-grid">
        {MENU_MODES.map((m) => (
          <button key={m.id} className="mode-card" onClick={() => onPick(m)}>
            <span className="key">{m.key}</span>
            <strong>{m.title}</strong>
            <span>{m.blurb}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <button onClick={onLeaderboard}><span className="key">L</span> Leaderboard</button>
        <button onClick={onSettings}><span className="key">S</span> Camera &amp; settings</button>
        <button onClick={onCrowd}><span className="key">C</span> Open crowd screen</button>
      </div>
    </div>
  );
}
