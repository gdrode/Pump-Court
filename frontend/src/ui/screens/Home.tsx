import { HOME_KEYS, MENU_MODES, type MenuModeInfo } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";

interface Props {
  onPick: (mode: MenuModeInfo) => void;
  onLeaderboard: () => void;
  onSettings: () => void;
  onCrowd: () => void;
}

/** Operator menu. Number keys pick a mode so the player can stay on the mat. */
export function Home({ onPick, onLeaderboard, onSettings, onCrowd }: Props) {
  useKeys({
    ...Object.fromEntries(MENU_MODES.map((m) => [m.key, () => onPick(m)])),
    [HOME_KEYS.leaderboard]: onLeaderboard,
    [HOME_KEYS.settings]: onSettings,
    [HOME_KEYS.crowd]: onCrowd,
  });

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
