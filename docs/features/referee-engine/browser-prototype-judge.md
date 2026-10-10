# The Standalone Tracker App (`pumpCourt/`)

> **Module**: `pumpCourt/` (Vite + React 19 app): `src/judge.ts`, `src/posture.ts`, `src/pose.ts`, `src/repLog.ts`, `src/game.ts`, `src/useLane.ts`, `src/Setup.tsx`, `src/Judging.tsx`, `src/Diagnostics.tsx`, `src/App.tsx`  
> **Tests**: `pumpCourt/src/__tests__/`, `pumpCourt/server/__tests__/` (`npm test`)  
> **Related Documents**: [Referee Overview](README.md), [Rep Segmentation](rep-segmentation.md), [Ready Check](ready-check-calibration.md), [Browser Prototype Modes](../game-engine/browser-prototype-modes.md), [Tracker Integration](../developer-guides/tracker-integration.md)  
> **Last Updated**: 2026-10-10  

---

## 1. Summary

`pumpCourt/` is the teammate's own browser app. Pump Court uses its plain-TypeScript modules directly (through `@tracker/*`), so the referee in the desktop app **is** this referee. The standalone app is still useful as a tuning bench: it has live diagnostics, rep logs and log replay, which the desktop app leaves out. It also has its own game modes and co-op ([Browser Prototype Modes](../game-engine/browser-prototype-modes.md)), which the desktop app does not use.

| | Standalone `pumpCourt/` | Pump Court desktop app |
| :--- | :--- | :--- |
| Referee | `judge.ts`, always **Hard** (`DIFFICULTY.hard`, no toggle) | `judge.ts`, always **Normal** (`REFEREE_RULES = DIFFICULTY.normal`) |
| Posture check | `posture.ts` | `posture.ts` (same file) |
| Pose model | `landmarker.ts`, `full`, one per player | `landmarker.ts`, `full` (same file), one camera |
| Game rules | `game.ts`: Sprint / Marathon / Max, single or co-op | Rust engine: Sprint / Minute / Max / Duel ([Game Modes](../game-engine/game-modes.md)) |
| Score keeping | results in the page | Rust engine, SQLite leaderboard |
| Phone pairing | Vite dev-server plugin (`server/phoneSignal.ts`, `server/tunnel.ts`) | Rust port in `backend/src/phone/` |
| Picture rotation | `useLane.ts` (`rotation`) | ported to `TrackerProvider.tsx` |
| Diagnostics, rep log, replay | yes | no |

Easy and Normal stay in `DIFFICULTY` for tests and tuning; the prototype's game no longer offers them. The thresholds of all three are in the [Referee Overview](README.md#2-the-rules-are-fixed).

---

## 2. Pipeline per frame

```
MediaPipe landmarks → pose.ts (nearest side, angles) → posture.ts (in position? floor line) → judge.ts (reps, 3 lights)
```

All three steps are plain TypeScript with no camera code, so they run the same live, in tests, and on replayed logs.

## 3. Posture gate (`posture.ts`)

No rep is judged unless the player is in the push-up position. This stops reps being counted while someone sits upright.

| Check | Rule |
| --- | --- |
| Trunk (shoulder → hip) | less than 40° from horizontal (sitting/standing ≈ 90°) |
| Whole body (shoulder → ankle) | less than 35° from horizontal |
| Legs | knee angle ≥ 150° (a plank, not knee push-ups; kneeling reads ~90–120°) |
| Hands | wrist visible (≥ 0.5), below the shoulder, within one arm length of it horizontally |
| Getting ready | arms nearly straight (shoulder ≥ 0.7 arm lengths above hands) and wrist still (< 0.04 frame) for 0.5 s |
| Staying ready | hands stay within 0.08 frame of where they were planted; 0.6 s grace for blips |

When ready, the planted hands' height becomes the **floor line**. Shoulder height is then measured from it: `height = (floorY − shoulderY) / armLength` (≈ 1 at the top, ≈ 0.2–0.35 chest near floor).

Each player's stage shows the state: *Get down into the push-up position*, *Knees off the floor: get into a full plank*, *Put the hands on the floor*, *Hold still at the top…*, *✓ Ready*. The prototype's countdown waits until every player is ready. In the desktop app the same states drive the get-ready checklist ([Ready Check](ready-check-calibration.md)).

## 4. Three lights (`judge.ts`)

| Light | Measured as | Easy | Normal (app) | Hard (prototype) |
| --- | --- | --- | --- | --- |
| Depth | how far the shoulders drop, as a share of the player's own straight-arm top height (bottom ignores the single lowest frame) | ≥ 25% | ≥ 30% | ≥ 35% |
| Torso: body line | angle at the **abdominal point** (shoulder–abdomen–knee), worst 10% of frames ignored | ≥ 145° | ≥ 155° | ≥ 165° |
| Torso: knees | hip–knee–ankle | ≥ 140° | ≥ 150° | ≥ 160° |
| Lockout | elbow on the way up reaches the threshold, **or** the shoulders get back within 0.05 arm lengths of the player's straight-arm top height | ≥ 145° | ≥ 155° | ≥ 165° |

2 or 3 white lights = counted; 3 = perfect.

Depth history (2026-10-10, live testing): absolute heights in arm lengths (0.30 → 0.45 → 0.60) were first too strict, then let quarter reps pass, because a player's top height depends on where the hands are placed and how the camera sees the arm. Depth is now **relative to the player's own straight-arm top height** (the highest shoulder height between reps over the last 30 s). Guide: quarter rep ≈ 10–25% drop, conventional push-up (elbows ~90°) ≈ 40–50%. Without visible hands, depth falls back to the elbow angle (Easy 100°, Normal 95°, Hard 90°).

**Abdominal point**: 60% of the way from shoulder to hip (`ABDOMEN_FRACTION`), over the abdomen where the trunk folds. MediaPipe has no spine landmarks, so the point lies on the shoulder–hip line; the angle at it, measured to the knee, captures hip flexion and abdominal crunch/sag. `bodyOffset` (its signed distance from the shoulder–ankle line) names the fault: *hips sagging* (below) or *hips piked up* (above).

## 5. Rep segmentation (`SEGMENT` in `judge.ts`)

Full details: [Rep Segmentation](rep-segmentation.md). In short:

- Reps are found from a **drive signal**: shoulder height above the floor line × `HEIGHT_TO_DRIVE` (150), else the elbow angle. This handles **flared elbows**, which barely seem to bend side-on while the shoulders still go all the way down and up.
- Start: drive 20 below its highest value in the last 4 s, and the player is ready. Coming up: drive 20 above its lowest point.
- End: **judged immediately on lockout** (elbow threshold, or shoulders back at the top height) once at least 60% back up; or a new descent of 45; or 1.5 s without getting higher once 60% back up. Lower than that, the judge keeps waiting: a slow grind still counts when it locks out.
- **A push-up is two parts: down, then back up** (`minAscent` 0.6). Collapsing flat to the floor at failure is no rep, no lights. In the prototype's game, staying stuck ends that player's round (failure window).
- An attempt needs the shoulders to drop **≥ 25% of their top height within the rep** (`minAttemptDrop`; quarter reps and adjustments get no lights and no count) and ≥ 0.12 s. Without height: ≥ 45° of elbow range and the shoulder visibly moving.
- **Lockout by height** (added 2026-10-10): straight arms often read only 155–165° side-on, so the 165° Hard elbow threshold missed real lockouts. Getting back within 0.05 arm lengths of the straight-arm top height (≈ elbows ≥ 157°) counts as locked out. Coming back only to ~145° (≈ 0.08 short) still fails.
- Out of position for 0.6 s mid-rep drops the rep. During posture's 0.6 s grace period no height is reported, so sitting up can't be read as "back at the top".
- 3-frame median on elbow/depth at ≥ 20 fps; lockout trusts a brief raw peak when a neighbouring frame is within 20° (elbow) or 0.1 arm lengths (height).

## 6. Using it for tuning

```bash
cd pumpCourt
npm install        # also copies the MediaPipe wasm and fetches the model
npm run dev        # https://localhost:5173, also on the network (phones need HTTPS)
npm run dev:local  # http://127.0.0.1:5173 only, no certificate, no phone pairing
```

- Set up players, mode and cameras, then **Start** ([Browser Prototype Modes](../game-engine/browser-prototype-modes.md)). Results show each player's push-ups, perfect reps, accuracy, light rates and every rep's faults.
- **Diagnostics** (collapsed, player 1's camera, `src/Diagnostics.tsx`) shows frame rates, live angles, the fast-rep go/no-go test, the camera frame-rate table, and **Judge this log**: replay a recorded log (`src/repLog.ts`) through the referee on Hard. Rep logs (`replog-*.json`) and clips stay on the laptop (git-ignored).

## 7. Tests

```bash
cd pumpCourt
npm test           # vitest
```

| File | Covers |
| :--- | :--- |
| `src/__tests__/geometry.test.ts` | `angle()` |
| `src/__tests__/pose.test.ts` | side choice, angles, depth |
| `src/__tests__/posture.test.ts` | the ready states (including `knees-down`) and the floor line |
| `src/__tests__/judge.test.ts`, `judge.adversarial.test.ts` | rep splitting, lights, glitches, flared elbows, collapses, cheats (synthetic motion from `synth.ts`) |
| `src/__tests__/repLog.test.ts` | rep logs and replay |
| `src/__tests__/game.test.ts`, `game.integration.test.ts` | the prototype's game modes and co-op (not used by the desktop app) |
| `server/__tests__/phoneSignal.test.ts`, `relay.test.ts` | the prototype's pairing server |

Run them after any change to `judge.ts`, `posture.ts` or `pose.ts`, because the desktop app uses those files directly.

## 8. Open items

- Thresholds are tuned on synthetic data. Record real players and replay them with *Diagnostics → Judge this log* (scores on Hard, while the desktop app uses Normal).
- A half rep with a straight body and lockout still scores 2 lights and counts. Making depth mandatory is a one-line change in `score()`.
