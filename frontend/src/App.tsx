// The one place that decides which screen component shows for each state.
// To use a new design, point these imports at your own components; the
// logic hooks (src/logic) and backend calls (src/api) stay as they are.

import { bestSoFar } from "./logic/results";
import { useGameFlow } from "./logic/useGameFlow";
import { Crowd } from "./ui/screens/Crowd";
import { Home } from "./ui/screens/Home";
import { Leaderboard } from "./ui/screens/Leaderboard";
import { Players } from "./ui/screens/Players";
import { Results } from "./ui/screens/Results";
import { Round } from "./ui/screens/Round";
import { Settings } from "./ui/screens/Settings";
import { VersusResult } from "./ui/screens/VersusResult";

export default function App() {
  // The second window loads the same app at #/crowd.
  if (window.location.hash === "#/crowd") return <Crowd />;
  return <Operator />;
}

function Operator() {
  const flow = useGameFlow();
  const { state } = flow;

  let screen: React.ReactNode = null;
  switch (state.screen) {
    case "home":
      screen = (
        <Home onPick={flow.pickMode} onLeaderboard={() => flow.leaderboard()} onSettings={flow.settings} onCrowd={flow.openCrowd} />
      );
      break;
    case "names":
      screen = <Players mode={state.mode} onStart={flow.start} onBack={flow.home} />;
      break;
    case "round": {
      const { plan, results } = state;
      const versus = plan.players.length > 1;
      const best = versus ? bestSoFar(results) : null;
      screen = (
        <Round
          key={`${results.length}-${state.attempt}`} // fresh screen for each turn and restart
          mode={plan.mode.round}
          player={plan.players[results.length]}
          isTeam={plan.isTeam}
          turn={versus ? { index: results.length, total: plan.players.length } : undefined}
          target={versus ? (best ? { label: "To beat", ...best } : null) : undefined}
          onFinished={flow.finishRound}
          onRestart={flow.restartTurn}
          onAbort={flow.home}
        />
      );
      break;
    }
    case "results": {
      const { plan, results } = state;
      const versus = plan.players.length > 1;
      const next = plan.players[results.length];
      screen = (
        <Results
          key={results.length}
          result={results[results.length - 1]}
          nextLabel={!versus ? "Post score" : next ? `Post & ${next}'s turn` : "Post & see who won"}
          discardLabel={versus ? "Redo turn" : "Discard"}
          onPost={flow.post}
          onDiscard={flow.discard}
        />
      );
      break;
    }
    case "versusResult":
      screen = <VersusResult results={state.results} onRematch={flow.rematch} onDone={flow.home} />;
      break;
    case "leaderboard":
      screen = <Leaderboard key={state.category} initial={state.category} highlight={state.highlight} onBack={flow.home} />;
      break;
    case "settings":
      screen = <Settings onBack={flow.home} />;
      break;
  }

  return (
    <div className={`app ${state.screen === "round" ? "app--camera" : ""}`}>
      {flow.sourceError && (
        <div className="banner banner--bad banner--click top-banner sketch" onClick={flow.settings}>
          Camera: {flow.sourceError} (click for settings)
        </div>
      )}
      {screen}
    </div>
  );
}
