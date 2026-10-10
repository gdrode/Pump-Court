# Frontend State Machines & Custom React Hooks

> **Module**: `frontend/src/logic/`  
> **Key Hooks**: `useGameFlow`, `useRound`, `useNameEntry`, `useLeaderboard`, `useCrowd`, `useSettings`, `useKeys`  
> **Related Documents**: [Frontend UI Overview](README.md), [Crowd Display Sync](crowd-display-sync.md)  
> **Maintenance Status**: Active / Logic Specification  

---

## 1. Top-Level Flow State Machine (`useGameFlow`)

`useGameFlow` decides which screen the operator window shows:

```typescript
export type FlowState =
  | { screen: "home" }
  | { screen: "names"; mode: MenuModeInfo }
  | { screen: "round"; plan: Plan; results: RoundResult[]; attempt: number }
  | { screen: "results"; plan: Plan; results: RoundResult[] }
  | { screen: "versusResult"; plan: Plan; results: RoundResult[] }
  | { screen: "leaderboard"; category: Category; highlight?: string }
  | { screen: "settings" };
```

- `plan.players` holds one name, or 2–4 names for Versus.
- `results` holds the finished turns so far; its length is the current turn.
- `attempt` changes on a restart, which remounts the round screen.

### Flow Actions
| Action | From → To |
| :--- | :--- |
| `pickMode(mode)` | home → names |
| `start(players, isTeam)` | names → round (turn 1) |
| `finishRound(result)` | round → results |
| `restartTurn()` | voided round → same turn again |
| `post()` | results → next turn, Versus standings, or leaderboard (with the player highlighted) |
| `discard()` | results → deletes the saved run; solo goes home, Versus redoes the turn |
| `rematch()` | Versus standings → turn 1 with the same players |
| `home()`, `leaderboard(category?, highlight?)`, `settings()`, `openCrowd()` | navigation |

**Saving**: the backend saves each finished round at once, so nothing is lost if the laptop crashes. "Post" only moves on. "Discard" deletes the run with `backend.deleteRun(runId)`.

---

## 2. Live Round Hook (`useRound`)

`useRound` starts the round on mount and follows the backend `tick`, `rep` and `round-finished` events:

```typescript
const round = useRound({
  mode: "sprint",
  player: "Alex G",
  isTeam: false,
  onFinished: (result) => handleFinish(result),
  onRep: (rep) => playSound(rep),        // optional
  onCountdown: (secondsLeft) => beep(),  // optional
  onGo: () => go(),                      // optional
  onVoided: (reason) => buzz(),          // optional
});
```

### Exposed State & Controls
- `phase`: `'idle' | 'readyCheck' | 'countdown' | 'running' | 'finished'`.
- `readyItems`: the six ready-check rows (`body`, `sideOn`, `onePlayer`, `distance`, `fps`, `startPosition`).
- `countdownSeconds`: 3, 2, 1 during the countdown, else `null`.
- `cleanReps`, `attempts`, `elapsedMs`.
- `remainingMs`: time left (Sprint, Minute, Versus), else `null`.
- `idleRemainingMs`: Max mode only, time left to get the next clean rep.
- `lastRep`: latest `RepVerdict` (three referee lights and reasons); `lastRepAt`: when it arrived.
- `trackingLost`: athlete out of frame during the round.
- `voided`: reason text once the backend voided the run (nothing was saved).
- `tick`: raw frame for `<PoseView>`; `fps`.
- `cancel()`: stops the round without saving.

---

## 3. Other Hooks

- **`useNameEntry(mode, onStart)`**: names (1–4), active field, team flag, errors. `cleanName` drops odd characters and caps at 12. Before starting, it rejects empty or duplicate names, then checks each name with `backend.checkName` (the backend has the final say).
- **`useLeaderboard(initialCategory)`**: rows, tab, team toggle, `remove(row)`, `exportBackup()`.
- **`results.ts`**: `rankResults`, `versusOutcome` (standings, winner or tie, decided on accuracy), `bestSoFar` (Versus "to beat" box).
- **`useKeys(bindings)`**: keyboard shortcuts. Ignores key repeat. While typing in a text box only Enter, Escape and Alt combos count. Alt combos use the physical key (`"Alt+n"`).

---

## 4. Audio Triggers (`frontend/src/ui/sounds.ts`)

`play(id)` plays an mp3 from `frontend/public/sounds/` if it exists, else a Web Audio tone:
- `chime`: clean rep. `buzzer` + `norep`: no-rep. `beep`: countdown and last five seconds. `go`: clock starts. `final`: round over.
