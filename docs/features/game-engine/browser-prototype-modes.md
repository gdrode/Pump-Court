# Game Modes in the Browser Prototype (`pumpCourt/`)

> **Module**: `pumpCourt/src/game.ts` (rules), `pumpCourt/src/App.tsx` (wiring), `pumpCourt/src/useLane.ts` (one camera + tracker per player), `pumpCourt/src/Setup.tsx`, `pumpCourt/src/Judging.tsx`
> **Tests**: `pumpCourt/src/__tests__/game.test.ts`, `game.integration.test.ts`
> **Related Documents**: [Game Engine Overview](README.md), [Browser Prototype Judge](../referee-engine/browser-prototype-judge.md), [Browser Prototype Pairing](../phone-camera/browser-prototype-pairing.md)
> **Last Updated**: 2026-10-10

---

> **Note**: this page describes the teammate's standalone prototype only. The Pump Court app uses its own modes (Sprint, Marathon, Max, Duel; see [Game Modes](game-modes.md)), kept by the Rust engine. It does not use the prototype's `game.ts`, co-op or failure windows. It does use the same referee (`judge.ts`, on Normal rather than Hard) and posture check.

## 1. Flow

```
Setup: players (Single / Co-op) → mode (Sprint / Marathon / Max) → camera per player
  → Start → waiting (every player in the push-up position) → 3-2-1 → running → results
```

- Judging is always on **Hard** (`DIFFICULTY.hard`); there is no difficulty toggle.
- The countdown starts only when **every** player's posture is ready: a full plank, legs straight (knees off the floor), hands planted, arms straight and still (see the posture gate in the judge doc). If anyone leaves position during the 3-2-1, it goes back to waiting.
- Each player has their own camera, their own MediaPipe landmarker (`getLandmarker(…, slot)`; VIDEO mode tracks one body across frames, so two streams can't share one) and their own `RepJudge`.
- Judges are created fresh when the clock starts. Reps before the start or after a player has finished are ignored.

## 2. Modes (`MODES` in `game.ts`)

| Mode | Length | Ends when |
| --- | --- | --- |
| Sprint | 30 s | the clock runs out, or every player has failed |
| Marathon | 60 s | the clock runs out, or every player has failed |
| Max | no limit | every player has failed |

All modes have a 3 s countdown (`COUNTDOWN_MS`) with beeps, and the operator can press **Stop** at any time. In timed modes a rep still in progress at the buzzer does not count.

### Failure (all modes, `FAILURE` / `failWindow` in `game.ts`)

A player's round ends early, on their own, when they:

- **get up**: out of the push-up position (stood up, sat down, knees down, walked off) for 2 s;
- **get stuck**: partway through a rep (can't press back up) longer than the failure window;
- **stop**: in position but no new rep for longer than the failure window.

The failure window grows with fatigue: **4 s + 0.25 s per rep attempted**, capped at **6 s (Sprint), 8 s (Marathon), 10 s (Max)**. Max reaches its 10 s cap after 24 reps. So a 7 s pause ends the round at the start of a set, but not after 20 reps.

In the last 3 s before failing, the player's stage shows **"Keep going! 3…2…1"**. Leaving position mid-round shows the posture prompt. Added 2026-10-10 (failure used to apply to Max only, with fixed 5 s / 8 s windows).

Score = points (`points` in `game.ts`): 2 per 3-light rep, 1 per 2-light rep. Co-op winner: most points, then most perfect (3-light) reps; equal = tie. Results show each player's push-ups, perfect reps, accuracy, light rates and every rep, plus the team total.

## 3. State machine (`game.ts`)

| Phase | Next |
| --- | --- |
| `waiting` | → `countdown` when every player is ready |
| `countdown` | → `running` after 3 s, always (it no longer goes back to `waiting` if someone leaves position) |
| `running` | → `finished` on time (Sprint/Marathon) or when every player has failed (any mode) |
| `finished` | Play again / Change setup |

`App.tsx` calls `tick(game, now, live)` every 100 ms with each player's `{ready, inRep}` and `addRep(game, player, rep, now)` whenever a judge returns a rep. All functions are pure, so the rules are tested without cameras.

## 4. Cameras

- Player 1 defaults to the laptop's camera; player 2 must pick one. Co-op needs two different cameras.
- Each player's **+ Add camera** opens the dialog; a phone paired from it becomes that player's camera.
- The dialog opens on **Phone · any network** (internet link). **Phone · same Wi-Fi (offline)** and **USB / system camera** are the other tabs. The Bluetooth tab was removed (it could not carry video).
- Two full-model trackers run at once in co-op, so each gets roughly half the laptop's tracking speed.
