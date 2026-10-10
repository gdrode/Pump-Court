import { useState } from "react";
import { GAME_MODES, HOME_KEYS, menuMode, PLAY_STYLES, type MenuModeInfo, type PlayStyle } from "../../config/modes";
import { useFixedCamera } from "../../logic/fixedCamera";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  /** How many times the menu has been opened; picks the dragon's line. */
  visit: number;
  onPick: (mode: MenuModeInfo) => void;
  onLeaderboard: () => void;
  onSettings: () => void;
  onCrowd: () => void;
}

/**
 * Operator menu, in two steps: Singleplayer or Duel in the top bar, then a
 * game mode below it (the modes light up once a play style is picked).
 * Keys: ← / → pick the play style, 1–3 the mode, so the player can stay on the mat.
 */
export function Home({ visit, onPick, onLeaderboard, onSettings, onCrowd }: Props) {
  const [style, setStyle] = useState<PlayStyle | null>(null);
  const [eventNote, setEventNote] = useState(false);
  const [fixed, setFixed] = useFixedCamera();
  const toggleFixed = () => setFixed(!fixed);

  const pickMode = (i: number) => {
    const m = GAME_MODES[i];
    if (style && m) onPick(menuMode(style, m));
  };

  useKeys({
    ...Object.fromEntries(GAME_MODES.map((m, i) => [m.key, () => pickMode(i)])),
    [HOME_KEYS.single]: () => setStyle("single"),
    [HOME_KEYS.duel]: () => setStyle("duel"),
    [HOME_KEYS.event]: () => setEventNote(true),
    [HOME_KEYS.fixedCamera]: toggleFixed,
    [HOME_KEYS.leaderboard]: onLeaderboard,
    [HOME_KEYS.settings]: onSettings,
    [HOME_KEYS.crowd]: onCrowd,
  });

  const says = eventNote ? host.eventSoon : host.home(visit);

  return (
    <div className="home">
      <header className="home__head">
        <h1 className="title">
          <TitleLights />
          Pump Court
        </h1>
        <Dragon action="curl" size="lg" bubble="top" says={says} />
      </header>

      <div className="home__menu">
        <div className="play-style" role="radiogroup" aria-label="Who's playing">
          {PLAY_STYLES.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={style === p.id}
              className={`play-style__btn sketch ${style === p.id ? "is-on" : ""}`}
              onClick={() => setStyle(p.id)}
            >
              <span className="play-style__label">{p.title}</span>
              <span className="play-style__blurb">{p.blurb}</span>
            </button>
          ))}
        </div>

        <div className={`modes ${style ? "is-lit" : "is-dim"}`} aria-disabled={!style}>
          {GAME_MODES.map((m, i) => (
            <button
              key={m.id}
              className={`mode sketch mode--${m.id} ${m.id === "sprint" ? "mode--main" : ""}`}
              onClick={() => pickMode(i)}
              disabled={!style}
              title={style ? undefined : "Pick Singleplayer or Duel first"}
            >
              <span className="mode__key sketch">{m.key}</span>
              <span className="mode__label">{m.title}</span>
              <span className="mode__blurb">{m.blurb}</span>
              {m.note && <span className="mode__note">{m.note}</span>}
            </button>
          ))}
        </div>

        <button className="create-event sketch" onClick={() => setEventNote(true)}>
          <span className="create-event__label">+ Create event</span>
          <span className="create-event__blurb">{eventNote ? "Coming soon" : "Run a leaderboard for the event you're hosting"}</span>
        </button>
      </div>

      <div className="home__foot">
        <KeyHints
          hints={[
            ["← →", "singleplayer / duel"],
            [`1–${GAME_MODES.length}`, "pick a mode"],
            ["E", "create event"],
            ["L", "leaderboard", onLeaderboard],
            ["S", "camera", onSettings],
            ["W", "crowd screen", onCrowd],
          ]}
        />
        <button
          role="switch"
          aria-checked={fixed}
          className={`fixed-camera ${fixed ? "is-on" : ""}`}
          onClick={toggleFixed}
          title={
            fixed
              ? "On: the camera stays for every player and scores post to the leaderboard automatically"
              : "Off: players use their own phone, see their stats on it and choose whether to post"
          }
        >
          <span className="fixed-camera__track" aria-hidden="true">
            <span className="fixed-camera__knob" />
          </span>
          Fixed camera <kbd>F</kbd>
        </button>
      </div>
    </div>
  );
}

/** The three white lights next to the title. */
export function TitleLights() {
  return (
    <span className="title__lights" aria-hidden="true">
      <i className="sketch" />
      <i className="sketch" />
      <i className="sketch" />
    </span>
  );
}
