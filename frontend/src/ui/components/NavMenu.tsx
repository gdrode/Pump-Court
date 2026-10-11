import { useState } from "react";
import { useFixedCamera } from "../../logic/fixedCamera";
import { MUSIC_CREDITS, useMusicVolume } from "../music";

interface Props {
  onLeaderboard: () => void;
  onSettings: () => void;
  onCrowd: () => void;
  /** Show the keyboard letters (only the home screen listens for them). */
  showKeys?: boolean;
}

/**
 * Gear in the bottom left corner. Hovering it (or tabbing to it, or tapping it
 * on a touch screen) slides the menu out to the right. Last item is the
 * Fixed camera switch, which stays open after a click so its state shows. The
 * music volume (mute + slider) sits in a small card above the open menu.
 */
export function NavMenu({ onLeaderboard, onSettings, onCrowd, showKeys = false }: Props) {
  const [open, setOpen] = useState(false);
  const [fixed, setFixed] = useFixedCamera();
  const music = useMusicVolume();
  const pct = Math.round(music.volume * 100);
  const item = (label: string, key: string, onClick: () => void) => (
    <button
      type="button"
      className="nav__item"
      onClick={(e) => {
        setOpen(false);
        e.currentTarget.blur(); // keyboard focus would keep the menu open
        onClick();
      }}
    >
      {label}
      {showKeys && <kbd>{key}</kbd>}
    </button>
  );
  return (
    <nav className={`nav sketch ${open ? "is-open" : ""}`} aria-label="Menu" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="nav__gear"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* Music volume: a card above the menu while it is open (the credits are its tooltip). */}
      <div className="nav__music">
        <div className={`music-vol sketch ${music.muted ? "is-muted" : ""}`} title={MUSIC_CREDITS.join("\n")}>
          <button
            type="button"
            className="music-vol__mute"
            aria-pressed={music.muted}
            onClick={music.toggleMute}
            aria-label={music.muted ? "Turn the music on" : "Mute the music"}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor" />
              {music.muted ? (
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
            Music
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={music.muted ? 0 : pct}
            onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
            aria-label="Music volume"
            className="music-vol__slider"
          />
          <span className="music-vol__pct">{music.muted ? "off" : `${pct}%`}</span>
        </div>
      </div>
      <div className="nav__items">
        {item("Leaderboard", "L", onLeaderboard)}
        {item("Camera settings", "S", onSettings)}
        {item("Crowd screen", "W", onCrowd)}
        <button
          type="button"
          role="switch"
          aria-checked={fixed}
          className={`nav__item fixed-camera ${fixed ? "is-on" : ""}`}
          onClick={() => setFixed(!fixed)}
          title={
            fixed
              ? "On: the camera stays for every player and scores post to the leaderboard automatically"
              : "Off: players use their own phone, see their stats on it and choose whether to post"
          }
        >
          <span className="fixed-camera__track" aria-hidden="true">
            <span className="fixed-camera__knob" />
          </span>
          Fixed camera
          {showKeys && <kbd>F</kbd>}
        </button>
      </div>
    </nav>
  );
}
