// The one place that decides which screen component shows for each state.
// To use a new design, point these imports at your own components; the
// logic hooks (src/logic) and backend calls (src/api) stay as they are.

import { useGameFlow } from "./logic/useGameFlow";
import { Crowd } from "./ui/screens/Crowd";
import { Home } from "./ui/screens/Home";
import { Leaderboard } from "./ui/screens/Leaderboard";
import { NameEntry } from "./ui/screens/NameEntry";
import { Results } from "./ui/screens/Results";
import { RoundScreen } from "./ui/screens/RoundScreen";
import { Settings } from "./ui/screens/Settings";

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
        <Home onPick={flow.pickMode} onLeaderboard={flow.leaderboard} onSettings={flow.settings} onCrowd={flow.openCrowd} />
      );
      break;
    case "names":
      screen = <NameEntry mode={state.mode} onStart={flow.start} onBack={flow.home} />;
      break;
    case "round":
      screen = (
        <RoundScreen
          key={state.results.length} // fresh screen for each duel turn
          mode={state.plan.mode.round}
          player={state.plan.players[state.results.length]}
          isTeam={state.plan.isTeam}
          onFinished={flow.finishRound}
          onCancel={flow.home}
        />
      );
      break;
    case "results":
      screen = (
        <Results
          results={state.results}
          players={state.plan.players}
          onNext={flow.nextTurn}
          onAgain={flow.playAgain}
          onLeaderboard={flow.leaderboard}
          onHome={flow.home}
        />
      );
      break;
    case "leaderboard":
      screen = <Leaderboard onBack={flow.home} />;
      break;
    case "settings":
      screen = <Settings onBack={flow.home} />;
      break;
  }

  return (
    <>
      {flow.sourceError && (
        <div className="banner bad" onClick={flow.settings}>
          Camera: {flow.sourceError} (click for settings)
        </div>
      )}
      {screen}
    </>
  );
}
