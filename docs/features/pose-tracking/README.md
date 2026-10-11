# Feature 01: Pose Tracking Pipeline

> **Module**: `frontend/src/logic/tracker/TrackerProvider.tsx` and `pumpCourt/src/{camera,landmarker,pose,draw,geometry}.ts`  
> **Key Types**: `TrackerProvider`, `TrackerFrame`, `Landmark`, `PoseAngles`, `CameraChoice`, `PhoneCamera`, `Rotation`  
> **Related Documents**: [MediaPipe Integration](mediapipe-integration.md), [Referee Engine](../referee-engine/README.md), [Tracker Integration](../developer-guides/tracker-integration.md)  
> **Maintenance Status**: Active / Core  

---

## 1. Summary

The pose tracker turns a live camera picture into the body angles the referee needs. It runs in the operator window, using MediaPipe Pose Landmarker and the teammate's plain-TypeScript modules in `pumpCourt/src` (imported as `@tracker/*`).

There is no mock athlete and no Rust pose code. A real camera is needed: the laptop webcam, a USB camera, or a phone (see [Phone Camera](../phone-camera/README.md)).

```text
camera / phone stream ─▶ one shared <video>
   ─▶ (turned onto the frame <canvas> when rotation ≠ 0)
   ─▶ MediaPipe Pose Landmarker (landmarker.ts)       33 landmarks, up to 3 people
   ─▶ person lock (person.ts createPersonLock)         the player's landmarks (one person)
   ─▶ side tracker (pose.ts createSideTracker)         angles of the near side, or null
   ─▶ posture check (posture.ts)                       ready? floor line, height
   ─▶ subscribers: useRound (the referee), the Camera screen
   └▶ skeleton overlay on a <canvas> (draw.ts)
```

---

## 2. `TrackerProvider` (`frontend/src/logic/tracker/TrackerProvider.tsx`)

`App.tsx` wraps the operator screens in `<TrackerProvider>`. The crowd window does not, so it never opens a camera.

What it does:
- **One video, one frame canvas, one overlay.** It creates a single `<video>`, a `canvas.camera-view__frame` for the turned picture, and an overlay `<canvas>` for the whole app. `<CameraView>` (`ui/components/CameraView.tsx`) borrows them with `attach(el)`. Detection only runs while at least one view is attached (the Round and Camera screens).
- **Camera choice.** Cameras are keyed `device:<deviceId>` (system cameras from `listCameras()`) or `phone:<room>` (paired phones). The last system camera used is remembered in `localStorage` (`pumpcourt.cameraId`, from `camera.ts`). If the saved camera is gone, any camera is used.
- **Model.** `getLandmarker(MODEL, cpuOnly)` loads the `full` model, GPU first. If detection fails 10 times in a row on the GPU, it reloads on the CPU. See [MediaPipe Integration](mediapipe-integration.md).
- **One detection per real frame.** It counts frames with `requestVideoFrameCallback` (or `video.currentTime` as a fallback), so a frame is never judged twice. Timestamps passed to `detectForVideo` always increase.
- **Stalled camera.** If no new frame arrives for 500 ms (for example a phone dropping out), it clears the skeleton and publishes a frame with `angles: null`, so "ready" cannot stick.
- **Live display data.** A few times a second it updates `live.posture` and `live.poseFps` for the screens.

### Frame contract

```typescript
export interface TrackerFrame {
  t: number;                  // performance.now()-based time, ms
  angles: PoseAngles | null;  // near-side angles, or null when nobody is tracked well enough
  posture: Posture;           // pumpCourt/src/posture.ts: state, ready, height
}
```

`subscribe(cb)` / `useTrackerFrames(cb)` deliver every frame. `resetPosture()` forgets the planted floor line; `useRound` calls it when a round starts.

### Errors shown to the operator
- `cameraError`: camera refused ("Allow it for Pump Court in the system settings, then restart the app"), no camera found, or a phone that is disconnected. Outside the Round and Camera screens it shows as a red banner that opens the Camera screen.
- `modelStatus`: "Loading tracking…" until the model is ready, or the error if it failed.

---

## 3. Landmarks and the tracked side (`pumpCourt/src/pose.ts`)

MediaPipe returns 33 landmarks `{x, y, z, visibility}`, with `x` and `y` from 0 to 1 across the frame. The camera is side-on, so only the side **nearest the camera** is used. The far side is hidden behind the body and ignored.

| Point | Left | Right |
| :--- | :--- | :--- |
| Shoulder | 11 | 12 |
| Elbow | 13 | 14 |
| Wrist | 15 | 16 |
| Hip | 23 | 24 |
| Knee | 25 | 26 |
| Ankle | 27 | 28 |

- `sideVisibility` is the mean visibility of those six points.
- `pickSide` keeps the current side unless the other side is better by `SIDE_SWITCH_MARGIN` (0.15), so the choice does not flicker.
- `createSideTracker().update(pose, aspect)` returns `null` when the chosen side's visibility is below `MIN_SIDE_VISIBILITY` (0.5).
- `x` is multiplied by the video's width/height ratio before measuring, so angles are true angles.

The angles themselves are described in [Angles & Biomechanics](../referee-engine/angles-and-biomechanics.md).

---

## 4. Skeleton overlay (`pumpCourt/src/draw.ts`)

`drawOverlay` draws only the tracked side: white bones (shoulder–elbow–wrist, shoulder–hip–knee–ankle) and blue joints. No numbers are drawn on the camera view. The colours are set in `draw.ts`, not in the frontend theme.

---

## 5. Picture rotation

A phone propped on its side with rotation lock on sends a sideways picture, and MediaPipe needs the player upright. Ported from the prototype's `pumpCourt/src/useLane.ts`.

- `Rotation` = 0 | 90 | 180 | 270, a clockwise turn.
- The turn in use = the operator's choice for this camera (`rotate()`), else the phone's own `PhoneCamera.rotationHint` (from its tilt, see [Phone on its side](../phone-camera/README.md#5-phone-on-its-side-rotation)), else 0.
- The operator's choice is kept per camera key, so switching cameras keeps each one's turn. `rotateAuto()` drops it.
- When the turn is not 0, each frame is drawn turned onto the frame canvas. `detectForVideo` runs on that canvas, the side tracker gets its aspect ratio, and the overlay canvas takes its size. The video is hidden and the frame canvas is shown instead.
- A new turn restarts the detection loop with a fresh side tracker, and resets the posture check (the floor line was measured on the old picture).
- API: `rotation`, `rotationAuto` (true when not set by the operator), `rotate()`, `rotateAuto()`. `<CameraView rotatable>` shows them.

---

## 6. Tracking loss

- No body, or a body too faint to judge, gives `angles: null`. The posture check then reports `no-player`.
- Losing the position for more than `POSTURE.graceMs` (600 ms) ends "ready".
- The referee drops a rep in progress after `SEGMENT.maxGapMs` (1.5 s) without the player, or `SEGMENT.notReadyMs` (600 ms) out of position.
- Rounds are not voided. The clock keeps running; the player simply scores nothing while not tracked.

---

## 7. Several people in view: person lock and Recalibrate

A crowded venue puts people behind and beside the player. MediaPipe looks for up to `PERSON.maxPeople` (3) bodies per frame, and `pumpCourt/src/person.ts` decides which one is the player. It is pure and deterministic (tests: `person.test.ts`).

- **`bodyOf(pose, aspect)`**: the box around the visible points (shoulders, elbows, wrists, hips, knees, ankles, visibility ≥ 0.3) → centre and size (its diagonal). Bigger = closer to the camera.
- **`startScore(pose, aspect)`**: how much a body looks like "the next player, ready to start": `visibility × (2·size + 1.5·level + 0.5·hands below shoulders + 0.5·low in the picture)`. `level` is 1 for a body lying flat (shoulder to ankle horizontal) and 0 standing up.
- **`createPersonLock().pick(poses, aspect, t)`**:
  - With nobody locked: takes the best `startScore`.
  - Then follows the same person from frame to frame: the body whose centre moved less than `matchDistance` (0.6 body sizes) and whose size changed less than `matchScale` (1.8×). Someone better placed walking in is ignored.
  - If the player is unseen for `lostMs` (1.5 s), it takes whoever is best placed.
  - Returns `switched: true` when the person changes; `TrackerProvider` then starts a fresh side tracker and resets the posture check (their floor line is their own).
- **Recalibrate** (`recalibrate()`, the **⌖ Recalibrate** button at the bottom left of every camera picture: get-ready, during the round, Duel cameras, Camera screen): on the next frame, drop the current person and lock onto the best `startScore` among the **others**. If nobody else is in view, it keeps the current person; with nobody at all, it takes whoever appears next.
- Mid-round, a switch also resets "ready": the new person has the usual 2 s to be in position before the round fails ("out of position").
- `numPoses > 1` can cost pose rate on a slow laptop. If the Camera screen shows the poses/s dropping well below 30, lower `PERSON.maxPeople` to 2.

