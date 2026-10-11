import { useState } from "react";
import { GAME_MODES, HOME_KEYS, menuMode, PLAY_STYLES, type MenuModeInfo, type PlayStyle } from "../../config/modes";
import { setFixedCamera, isFixedCamera } from "../../logic/fixedCamera";
import { useActiveEvent, type BoardRef } from "../../logic/useEvents";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { EventBoardCycle } from "../components/EventBoardCycle";
import { Logo } from "../components/Logo";
import { MUSIC_CREDIT_LINE } from "../music";
import { SOUND_CREDIT_LINE } from "../sounds";
import { host } from "../host";

interface Props {
  /** How many times the menu has been opened; picks the dragon's line. */
  visit: number;
  onPick: (mode: MenuModeInfo) => void;
  /** The events screen (create, edit, pick the active event). */
  onEvents: () => void;
  /** The leaderboard screen, on `board` if given (e.g. a click on the event's boards). */
  onLeaderboard: (board?: BoardRef) => void;
  onSettings: () => void;
  onCrowd: () => void;
}

/**
 * Operator menu, in two steps: Singleplayer or Duel in the top bar, then a
 * game mode below it (the modes light up once a play style is picked).
 * Keys: ← / → pick the play style, 1–3 the mode, so the player can stay on the mat.
 * Leaderboard, camera, crowd screen and the Fixed camera switch live in the
 * gear menu (bottom left); L, S, W and F still work here.
 */
export function Home({ visit, onPick, onEvents, onLeaderboard, onSettings, onCrowd }: Props) {
  const [style, setStyle] = useState<PlayStyle | null>(null);
  const event = useActiveEvent();
  const toggleFixed = () => setFixedCamera(!isFixedCamera());

  const pickMode = (i: number) => {
    const m = GAME_MODES[i];
    if (style && m) onPick(menuMode(style, m));
  };

  useKeys({
    ...Object.fromEntries(GAME_MODES.map((m, i) => [m.key, () => pickMode(i)])),
    [HOME_KEYS.single]: () => setStyle("single"),
    [HOME_KEYS.duel]: () => setStyle("duel"),
    [HOME_KEYS.event]: onEvents,
    [HOME_KEYS.fixedCamera]: toggleFixed,
    [HOME_KEYS.leaderboard]: () => onLeaderboard(),
    [HOME_KEYS.settings]: onSettings,
    [HOME_KEYS.crowd]: onCrowd,
  });

  const says = host.home(visit);

  return (
    <div className="home">
      <header className="home__head">
        <Logo />
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
              <span className="mode__label">{m.title}</span>
              <span className="mode__blurb">{m.blurb}</span>
              {m.note && <span className="mode__note">{m.note}</span>}
            </button>
          ))}
        </div>

        <button className={`create-event sketch ${event ? "is-on" : ""}`} onClick={onEvents}>
          <span className="create-event__label">{event ? `Event: ${event.name}` : "+ Create event"}</span>
          <span className="create-event__blurb">
            {event ? "Solo scores count for this event. Change or make events" : "Run a leaderboard for the event you're hosting"}
          </span>
        </button>

        {/* During an event: its boards in turn (every mode × Everyone and each role, then teams). */}
        {event && <EventBoardCycle event={event} rows={4} onOpen={onLeaderboard} />}
      </div>
      <p className="music-credits">
        {MUSIC_CREDIT_LINE} · {SOUND_CREDIT_LINE}
      </p>
    </div>
  );
}
