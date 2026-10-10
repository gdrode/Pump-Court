# Ready Check & The Floor Line (Posture Tracker)

> **Module**: `pumpCourt/src/posture.ts`, used by `frontend/src/logic/tracker/TrackerProvider.tsx`, `frontend/src/logic/useRound.ts`, `frontend/src/ui/screens/Round.tsx`  
> **Key Types**: `POSTURE`, `PostureState`, `Posture`, `POSTURE_MESSAGE`, `createPostureTracker`  
> **Related Documents**: [Referee Engine Overview](README.md), [Rep Segmentation](rep-segmentation.md), [Game Engine](../game-engine/README.md)  
> **Maintenance Status**: Active / Player Onboarding Gate  

---

## 1. Summary

Before the clock starts, the player must be in the push-up position: body near horizontal, legs straight (knees off the floor), hands planted under the shoulders, arms straight and still. The teammate's posture tracker decides this every frame. When it says **ready**, the app calls `set_ready(true)` and the backend starts the 3-2-1 countdown.

While ready, the posture tracker also gives the referee a steady **height**: how far the shoulders are above the planted hands, in arm lengths.

Sitting, standing, kneeling (knee push-ups) or walking into frame never count.

---

## 2. States, in order

`PostureState` and the text shown for each (`POSTURE_MESSAGE`):

| State | Means | Message |
| :--- | :--- | :--- |
| `no-player` | No usable body (angles are `null`) | Can't see the player. Get side-on to the camera with the whole body in view. |
| `no-hands` | Wrist visibility below 0.5 | Can't see the hands. Keep the near hand in view. |
| `not-down` | Trunk or whole body too upright | Get down into the push-up position. |
| `knees-down` | Knee angle below `minKnee` (150°): kneeling reads about 90–120°, a plank about 170° | Knees off the floor: get into a full plank, legs straight. |
| `hands-off-floor` | Wrist not below the shoulder, or more than one arm length in front of or behind it | Put the hands on the floor, under the shoulders. |
| `settle` | In position, but arms not straight or not still yet | Hold still at the top, arms straight, to start. |
| `ready` | All good | Ready. Go! |

The Round screen's get-ready panel (`ReadyPanel` in `ui/screens/Round.tsx`) shows one checklist row per step, ticked in this order: "Whole body in view, side-on", "Near hand in view", "Down in the push-up position", "Knees off the floor, legs straight", "Hands on the floor, under the shoulders", "Hold still at the top, arms straight". The dragon reads out the current message. The Camera screen shows the same message under "Player".

---

## 3. `POSTURE` constants

| Constant | Value | Meaning |
| :--- | :--- | :--- |
| `maxTrunkTilt` | 40° | Trunk (shoulder → hip) must tilt less than this from horizontal. Sitting or standing is near 90°. |
| `maxBodyTilt` | 35° | Whole body (shoulder → ankle) must tilt less than this |
| `minKnee` | 150° | Legs straight: knee angle at least this (a plank, not knee push-ups) |
| `minWristVisibility` | 0.5 | Wrist must be at least this visible to find the floor |
| `readyDepth` | 0.7 | To get ready, the shoulders must be at least this many arm lengths above the hands (arms nearly straight) |
| `settleMs` | 500 ms | …held still this long |
| `stillTravel` | 0.04 | "Still" = the wrist moves less than this (fraction of frame height; twice that sideways) |
| `handDrift` | 0.08 | Once ready, the hands must stay within this of where they were planted (twice that sideways) |
| `graceMs` | 600 ms | Losing the position (or the player) for this long ends "ready" |

---

## 4. Getting ready and the floor line

1. Every frame, `problem()` checks the rules above in order and returns the first one that fails.
2. In position with arms straight (`depth ≥ 0.7`), wrist samples are collected. If the wrist moves more than `stillTravel`, the collection starts again.
3. After about `settleMs` of stillness, the tracker becomes **ready** and plants:
   - `floorY` = the median wrist height while settling (the floor line),
   - `handX` = the median wrist position sideways,
   - `armLength` = the arm length at that moment.
4. While ready, `height = (floorY − shoulderY) / armLength`. This is the `depth` value the referee uses. About 1 at the top, near 0 with the chest on the floor.
5. Ready ends if a rule fails, or the hands drift more than `handDrift` from the planted spot, for longer than `graceMs`. A short blip (a missed frame, a shaky hand) does not end it. During that grace period the state stays `ready` but `height` is `NaN`, so a frame where the player sits up is never read as "back at the top".

There is no per-player lockout calibration. The lockout threshold is the same 155° for everyone (see [Referee Overview](README.md#2-the-rules-are-fixed)).

---

## 5. How the app uses it

```text
TrackerProvider: posture.update(t, angles) every frame ─▶ TrackerFrame.posture
useRound: when posture.ready (or in-a-rep) changes ─▶ backend.setReady(ready, inRep)
Rust Session:
  getReady  + set_ready(true)  ─▶ countdown (3 s) ─▶ running
  any phase + set_ready(x)     ─▶ only updates SessionSnapshot.inPosition
useRound: RepJudge gets ready = posture.ready and depth = posture.height
```

- `tracker.resetPosture()` is called when each round (or Duel turn) starts, so an old floor line is never reused. Changing the camera's rotation (**⟳ Rotate** or the phone's own value) also resets it, because the floor line was measured on the old picture.
- Once the countdown has started it **always runs to GO**, in every mode (Singleplayer and Duel): leaving the position during the 3-2-1 (`set_ready(false)`) never stops it. Once the clock runs, 2 s out of position ends the round (`left`, see [Game Modes](../game-engine/game-modes.md#2-failure-when-a-round-ends-early-every-mode)).
- The camera stalling for 500 ms publishes a `null` frame, so ready cannot stay on by mistake.
