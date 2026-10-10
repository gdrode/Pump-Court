# Game Modes in the Browser Prototype (`pumpCourt/`)

> **Module**: `pumpCourt/src/game.ts` (rules), `pumpCourt/src/App.tsx` (wiring), `pumpCourt/src/useLane.ts` (one camera + tracker per player), `pumpCourt/src/Setup.tsx`, `pumpCourt/src/Judging.tsx`
> **Tests**: `pumpCourt/src/__tests__/game.test.ts`, `game.integration.test.ts`
> **Related Documents**: [Game Engine Overview](README.md), [Browser Prototype Judge](../referee-engine/browser-prototype-judge.md), [Browser Prototype Pairing](../phone-camera/browser-prototype-pairing.md)
> **Last Updated**: 2026-10-10

---

## 1. Flow

```
Setup: players (Single / Co-op) → mode (Sprint / Marathon / Max) → camera per player
  → Start → waiting (every player in the push-up position) → 3-2-1 → running → results
```

- Judging is always on **Hard** (`DIFFICULTY.hard`); there is no difficulty toggle.
- The countdown starts only when **every** player's posture is ready (see the posture gate in the judge doc). If anyone leaves position during the 3-2-1, it goes back to waiting.
- Each player has their own camera, their own MediaPipe landmarker (`getLandmarker(…, slot)`; VIDEO mode tracks one body across frames, so two streams can't share one) and their own `RepJudge`.
- Judges are created fresh when the clock starts. Reps before the start or after a player has finished are ignored.

## 2. Modes (`MODES` in `game.ts`)

| Mode | Length | Ends when |
| --- | --- | --- |
| Sprint | 30 s | the clock runs out |
| Marathon | 60 s | the clock runs out |
| Max | no limit | per player: out of position for 2 s (stood/sat up), stuck in a rep for 5 s (can't press up), or 8 s in position without a rep (stopped). The round ends when every player has finished. |

All modes have a 3 s countdown (`COUNTDOWN_MS`) with beeps, and the operator can press **Stop** at any time. In timed modes a rep still in progress at the buzzer does not count.

Score = push-ups with 2 or 3 white lights. Co-op winner: most push-ups, then most perfect (3-light) reps; equal = tie. Results show each player's push-ups, perfect reps, accuracy, light rates and every rep, plus the team total.

## 3. State machine (`game.ts`)

| Phase | Next |
| --- | --- |
| `waiting` | → `countdown` when every player is ready |
| `countdown` | → `waiting` if anyone leaves position; → `running` after 3 s |
| `running` | → `finished` on time (Sprint/Marathon) or when all players finished (Max) |
| `finished` | Play again / Change setup |

`App.tsx` calls `tick(game, now, live)` every 100 ms with each player's `{ready, inRep}` and `addRep(game, player, rep, now)` whenever a judge returns a rep. All functions are pure, so the rules are tested without cameras.

## 4. Cameras

- Player 1 defaults to the laptop's camera; player 2 must pick one. Co-op needs two different cameras.
- Each player's **+ Add camera** opens the dialog; a phone paired from it becomes that player's camera.
- The dialog opens on **Phone · any network** (internet link). **Phone · same Wi-Fi (offline)** and **USB / system camera** are the other tabs. The Bluetooth tab was removed (it could not carry video).
- Two full-model trackers run at once in co-op, so each gets roughly half the laptop's tracking speed.
