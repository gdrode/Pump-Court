# Frontend State Machines & Custom React Hooks

> **Module**: `frontend/src/logic/`  
> **Key Hooks**: `useGameFlow`, `useRound`, `useCrowd`, `useNameEntry`, `useSettings`  
> **Related Documents**: [Frontend UI Overview](README.md), [Crowd Display Sync](crowd-display-sync.md)  
> **Maintenance Status**: Active / Logic Specification  

---

## 1. Top-Level Flow State Machine (`useGameFlow`)

`useGameFlow` manages which primary screen is mounted in the operator console:

```typescript
export type Screen = 
  | 'home'          // Mode selection menu (Sprint, Minute, Max, Duel)
  | 'name-entry'    // Athlete name entry & team checkbox
  | 'round'         // Live match screen (video, skeleton, lights)
  | 'turn-card'     // Duel mode: intermediate turn score card
  | 'results'       // Match conclusion report & fault summary
  | 'leaderboard'   // High score records table
  | 'settings';     // Camera selector, threshold sliders & phone QR
```

### Flow Actions:
- `pickMode(mode)`: Transitions to `name-entry`.
- `start(player, isTeam)`: Dispatches `backend.startRound()` and transitions to `round`.
- `finishRound(result)`: Transitions to `results` (or `turn-card` in Duel mode).
- `home()`, `leaderboard()`, `settings()`: Navigate between utility views.

---

## 2. Live Match Round Hook (`useRound`)

`useRound` encapsulates live match telemetry, subscribing to backend `tick`, `rep`, and `round-finished` events:

```typescript
const round = useRound({
  mode: 'sprint',
  player: 'Alex G',
  isTeam: false,
  onFinished: (result) => handleFinish(result),
  onCancel: () => handleCancel(),
});
```

### Exposed State & Controls:
- `phase`: `'readyCheck' | 'countdown' | 'running' | 'finished'`.
- `cleanReps`, `attempts`: Real-time rep counts.
- `remainingMs`: High-precision milliseconds remaining on game clock.
- `lastRep`: Most recent `RepVerdict` (containing the 3 referee lights and fault text).
- `readyItems`: Array of 4 ready check status indicators.
- `trackingLost`: Boolean flag indicating if athlete is currently out of frame.
- `tick`: Raw `Tick` payload containing skeleton coordinates and base64 video preview.
- `cancel()`: Immediately aborts match via `backend.cancelRound()`.

---

## 3. Audio & SFX Triggers (`frontend/src/ui/sounds.ts` & `pumpCourt/src/sfx.ts`)

Sound effects are synthesized dynamically using the browser **Web Audio API**:
- **Countdown Beep**: 880 Hz sine tone for 100ms.
- **Go Buzzer**: 1760 Hz high-frequency tone for 250ms.
- **Clean Rep Ding**: Two-tone chime (523 Hz to 1046 Hz) triggering on 2–3 white lights.
- **No-Rep Buzzer**: Low-frequency sawtooth tone (150 Hz) triggering on failed reps.
