// The one place that decides which screen component shows for each state.
// To use a new design, point these imports at your own components; the
// logic hooks (src/logic) and backend calls (src/api) stay as they are.

import { isCrowdWindow } from "./api/backend";
import { scoreToBeat } from "./logic/results";
import { TrackerProvider, useTracker } from "./logic/tracker/TrackerProvider";
import { useGameFlow } from "./logic/useGameFlow";
import { Crowd } from "./ui/screens/Crowd";
import { DuelResult } from "./ui/screens/DuelResult";
import { Home } from "./ui/screens/Home";
import { Leaderboard } from "./ui/screens/Leaderboard";
import { Players } from "./ui/screens/Players";
import { Results } from "./ui/screens/Results";
import { Round } from "./ui/screens/Round";
import { Settings } from "./ui/screens/Settings";

export default function App() {
  // The second window ("crowd") loads the same app.
  if (isCrowdWindow()) return <Crowd />;
  return (
    <TrackerProvider>
      <Operator />
    </TrackerProvider>
  );
}

function Operator() {
  const flow = useGameFlow();
  const { cameraError } = useTracker();
  const { state } = flow;

  let screen: React.ReactNode = null;
  switch (state.screen) {
    case "home":
      screen = <Home onPick={flow.pickMode} onLeaderboard={() => flow.leaderboard()} onSettings={flow.settings} onCrowd={flow.openCrowd} />;
      break;
    case "names":
      screen = <Players mode={state.mode} onStart={flow.start} onBack={flow.home} />;
      break;
    case "round": {
      const { plan, results } = state;
      const duel = plan.players.length > 1;
      const best = duel ? scoreToBeat(results) : null;
      screen = (
        <Round
          key={`${results.length}-${state.attempt}`} // fresh screen for each turn and redo
          mode={plan.mode.id}
          player={plan.players[results.length]}
          turn={duel ? { index: results.length, total: plan.players.length } : undefined}
          target={duel ? (best ? { label: "To beat", ...best } : null) : undefined}
          onFinished={flow.finishRound}
          onAbort={flow.home}
        />
      );
      break;
    }
    case "results": {
      const { plan, results } = state;
      const duel = plan.players.length > 1;
      const next = plan.players[results.length];
      screen = (
        <Results
          key={results.length}
          result={results[results.length - 1]}
          nextLabel={!duel ? "Post score" : next ? `Post & ${next}'s turn` : "Post & see who won"}
          discardLabel={duel ? "Redo turn" : "Discard"}
          onPost={flow.post}
          onDiscard={flow.discard}
        />
      );
      break;
    }
    case "duelResult":
      screen = <DuelResult results={state.results} onRematch={flow.rematch} onDone={flow.home} />;
      break;
    case "leaderboard":
      screen = <Leaderboard key={state.mode ?? "all"} initial={state.mode} highlight={state.highlight} onBack={flow.home} />;
      break;
    case "settings":
      screen = <Settings onBack={flow.home} />;
      break;
  }

  const cameraScreen = state.screen === "round" || state.screen === "settings";
  return (
    <div className={`app ${cameraScreen ? "app--camera" : ""}`}>
      {cameraError && !cameraScreen && (
        <button type="button" className="banner banner--bad banner--click top-banner sketch" onClick={flow.settings}>
          Camera: {cameraError} (click for camera settings)
        </button>
      )}
      {screen}
    </div>
  );
}
