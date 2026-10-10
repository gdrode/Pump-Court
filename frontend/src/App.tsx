// The one place that decides which screen component shows for each state.
// To use a new design, point these imports at your own components; the
// logic hooks (src/logic) and backend calls (src/api) stay as they are.

import { isCrowdWindow } from "./api/backend";
import { scoreToBeat } from "./logic/results";
import { TrackerProvider, useTracker } from "./logic/tracker/TrackerProvider";
import { useGameFlow } from "./logic/useGameFlow";
import { Crowd } from "./ui/screens/Crowd";
import { NavMenu } from "./ui/components/NavMenu";
import { DuelResult } from "./ui/screens/DuelResult";
import { DuelRound } from "./ui/screens/DuelRound";
import { Events } from "./ui/screens/Events";
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
    // Two trackers: player 1's camera (always on) and player 2's, for a side-by-side Duel.
    <TrackerProvider slot={0}>
      <TrackerProvider slot={1}>
        <Operator />
      </TrackerProvider>
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
      screen = (
        <Home
          visit={state.visit}
          onPick={flow.pickMode}
          onEvents={flow.events}
          onLeaderboard={(board) => flow.leaderboard(board)}
          onSettings={flow.settings}
          onCrowd={flow.openCrowd}
        />
      );
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
          tags={duel ? undefined : plan.event?.tags}
          onFinished={flow.finishRound}
          onAbort={flow.home}
        />
      );
      break;
    }
    case "results": {
      const { plan, results } = state;
      const duel = plan.players.length > 1;
      screen = (
        <Results
          key={results.length}
          result={results[results.length - 1]}
          nextPlayer={duel ? (plan.players[results.length] ?? null) : undefined}
          onNext={flow.next}
          onDiscard={flow.discard}
        />
      );
      break;
    }
    case "duelRound":
      screen = (
        <DuelRound
          key={state.attempt}
          mode={state.plan.mode.id}
          players={state.plan.players}
          onFinished={flow.finishDuel}
          onAbort={flow.home}
          onTakeTurns={flow.takeTurns}
        />
      );
      break;
    case "duelResult":
      screen = <DuelResult results={state.results} onRematch={flow.rematch} onDone={flow.home} />;
      break;
    case "leaderboard":
      screen = <Leaderboard key={JSON.stringify(state.board)} initial={state.board} highlight={state.highlight} onBack={flow.home} />;
      break;
    case "events":
      screen = <Events onBack={flow.home} />;
      break;
    case "settings":
      screen = <Settings onBack={flow.home} />;
      break;
  }

  const cameraScreen = state.screen === "round" || state.screen === "settings" || state.screen === "duelRound";
  // Hidden mid-round and on a result, so a stray click can't lose a score.
  const showNav = !["round", "results", "duelRound", "duelResult"].includes(state.screen);
  return (
    <div className={`app ${cameraScreen ? "app--camera" : ""} ${showNav ? "app--nav" : ""}`}>
      {showNav && (
        <NavMenu
          onLeaderboard={() => flow.leaderboard()}
          onSettings={flow.settings}
          onCrowd={flow.openCrowd}
          showKeys={state.screen === "home"}
        />
      )}
      {cameraError && !cameraScreen && (
        <button type="button" className="banner banner--bad banner--click top-banner sketch" onClick={flow.settings}>
          Camera: {cameraError} (click for camera settings)
        </button>
      )}
      {screen}
    </div>
  );
}
