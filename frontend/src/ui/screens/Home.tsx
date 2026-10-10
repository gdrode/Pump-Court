import { useEffect, useState } from "react";
import { backend } from "../../api/backend";
import type { LeaderboardRow } from "../../api/types";
import { HOME_KEYS, MENU_MODES, type MenuModeInfo } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { Dragon } from "../components/Dragon";
import { KeyHints } from "../components/KeyHints";
import { host } from "../host";

interface Props {
  onPick: (mode: MenuModeInfo) => void;
  onLeaderboard: () => void;
  onSettings: () => void;
  onCrowd: () => void;
}

/** Operator menu. Number keys pick a mode so the player can stay on the mat. */
export function Home({ onPick, onLeaderboard, onSettings, onCrowd }: Props) {
  const [leader, setLeader] = useState<LeaderboardRow | null>(null);
  useEffect(() => {
    backend.getLeaderboard("thirtySecond", false, 1).then((rows) => setLeader(rows[0] ?? null));
  }, []);

  useKeys({
    ...Object.fromEntries(MENU_MODES.map((m) => [m.key, () => onPick(m)])),
    [HOME_KEYS.leaderboard]: onLeaderboard,
    [HOME_KEYS.settings]: onSettings,
    [HOME_KEYS.crowd]: onCrowd,
  });

  return (
    <div className="home">
      <header className="home__head">
        <h1 className="title">
          <TitleLights />
          Pump Court
        </h1>
        <Dragon
          action="curl"
          size="lg"
          bubble="top"
          says={leader ? `${host.home} Sprint record: ${leader.name}, ${leader.cleanReps}.` : host.home}
        />
      </header>

      <div className="modes">
        {MENU_MODES.map((m) => (
          <button key={m.id} className={`mode sketch ${m.id === "sprint" ? "mode--main" : ""}`} onClick={() => onPick(m)}>
            <span className="mode__key sketch">{m.key}</span>
            <span className="mode__label">{m.title}</span>
            <span className="mode__blurb">{m.blurb}</span>
            {m.note && <span className="mode__note">{m.note}</span>}
          </button>
        ))}
      </div>

      <KeyHints
        hints={[
          [`1–${MENU_MODES.length}`, "pick a mode"],
          ["L", "leaderboard", onLeaderboard],
          ["S", "camera & settings", onSettings],
          ["W", "crowd screen", onCrowd],
        ]}
      />
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
