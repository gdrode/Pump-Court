import { useCallback, useEffect, useState } from "react";
import { backend, errorText, events } from "./api/backend";
import type { GhostRun, RoundResult } from "./api/types";
import { categoryOf, type MenuModeInfo } from "./game/modes";
import { useBackendEvent } from "./hooks/useBackend";
import { Crowd } from "./screens/Crowd";
import { Home } from "./screens/Home";
import { Leaderboard } from "./screens/Leaderboard";
import { NameEntry } from "./screens/NameEntry";
import { Results } from "./screens/Results";
import { RoundScreen } from "./screens/RoundScreen";
import { savedSource, Settings } from "./screens/Settings";

/** Everything needed to play one menu choice (1 or 2 turns). */
interface Plan {
  mode: MenuModeInfo;
  players: string[];
  isTeam: boolean;
  ghost: GhostRun | null;
}

type Screen =
  | { name: "home" }
  | { name: "names"; mode: MenuModeInfo }
  | { name: "round"; plan: Plan; results: RoundResult[] }
  | { name: "results"; plan: Plan; results: RoundResult[] }
  | { name: "leaderboard" }
  | { name: "settings" };

export default function App() {
  // The second window loads the same app at #/crowd.
  if (window.location.hash === "#/crowd") return <Crowd />;
  return <Operator />;
}

function Operator() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [sourceError, setSourceError] = useState<string | null>(null);
  const home = useCallback(() => setScreen({ name: "home" }), []);

  // Start the remembered camera (or the mock athlete) on launch.
  useEffect(() => {
    backend.startSource(savedSource()).catch((e) => setSourceError(errorText(e)));
  }, []);
  useBackendEvent(events.onSourceStatus, (s) => setSourceError(s.error));

  async function start(mode: MenuModeInfo, players: string[], isTeam: boolean) {
    const category = categoryOf(mode.round);
    const ghost = mode.id === "ghost" && category ? await backend.getGhostRun(category) : null;
    setScreen({ name: "round", plan: { mode, players, isTeam, ghost }, results: [] });
  }

  let body: React.ReactNode;
  switch (screen.name) {
    case "home":
      body = (
        <Home
          onPick={(mode) => setScreen({ name: "names", mode })}
          onLeaderboard={() => setScreen({ name: "leaderboard" })}
          onSettings={() => setScreen({ name: "settings" })}
          onCrowd={() => backend.openCrowdWindow()}
        />
      );
      break;
    case "names":
      body = <NameEntry mode={screen.mode} onBack={home} onStart={(p, team) => start(screen.mode, p, team)} />;
      break;
    case "round": {
      const { plan, results } = screen;
      const turn = results.length;
      body = (
        <RoundScreen
          key={turn} // remount for each duel turn
          mode={plan.mode.round}
          player={plan.players[turn]}
          isTeam={plan.isTeam}
          ghost={plan.ghost}
          onCancel={home}
          onFinished={(r) => setScreen({ name: "results", plan, results: [...results, r] })}
        />
      );
      break;
    }
    case "results": {
      const { plan, results } = screen;
      body = (
        <Results
          results={results}
          nextPlayer={plan.players[results.length] ?? null}
          onNext={() => setScreen({ name: "round", plan, results })}
          onAgain={() => setScreen({ name: "round", plan, results: [] })}
          onLeaderboard={() => setScreen({ name: "leaderboard" })}
          onHome={home}
        />
      );
      break;
    }
    case "leaderboard":
      body = <Leaderboard onBack={home} />;
      break;
    case "settings":
      body = <Settings onBack={home} />;
      break;
  }

  return (
    <>
      {sourceError && (
        <div className="banner bad" onClick={() => setScreen({ name: "settings" })}>
          Camera: {sourceError} (click for settings)
        </div>
      )}
      {body}
    </>
  );
}
