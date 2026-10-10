# Plugging in the motion tracker

> 💡 **Notice for AI Agents and Developers**: This guide has been incorporated into the comprehensive documentation suite. See the full feature documentation in [`docs/features/developer-guides/tracker-integration.md`](features/developer-guides/tracker-integration.md) and [`docs/features/pose-tracking/`](features/pose-tracking/README.md).

The tracker is the camera engine in `pumpCourt/`: **MediaPipe Pose Landmarker
running in the browser** (`@mediapipe/tasks-vision`). That fits the Tauri app
well, because the app's screens are a browser too. The backend accepts landmarks from either
side, so the tracker can run in the frontend (JavaScript) or native backend (Rust/C++),
sending each frame's landmarks to the backend. Nothing after `backend/src/pose/` (angles,
referees, rounds, leaderboard) needs to change either way.

## The contract

Each frame, the backend needs:

| Field | Meaning |
| --- | --- |
| `width`, `height` | image size in pixels (angles are measured in pixels) |
| `landmarks` | the 33 MediaPipe landmarks `{ x, y, z, visibility }` in MediaPipe's order, `x`/`y` normalised 0..1, or `null` if nobody was found |

Run the landmarker with `numPoses: 1` in `VIDEO` mode.

## Steps

1. Laptop camera: select the pushed source with `backend.startSource({ kind: "pushed" })`
   (and add it to `list_sources` in `backend/src/pose/mod.rs`, marked `TODO(tracker)`).
   Phone camera: keep the `{ kind: "phone" }` source; it pairs the phone video
   with the landmarks you push.
2. Each video frame, run MediaPipe and send the result:

   ```ts
   const result = landmarker.detectForVideo(video, performance.now());
   backend.pushPoseFrame({
     width: video.videoWidth,
     height: video.videoHeight,
     landmarks: result.landmarks[0] ?? null,
   });
   ```

   The engine judges reps from these exactly as it does for the mock athlete.
   If frames stop for more than 0.25 s, the engine counts "nobody in view", and
   a running round is voided after the tracking-loss limit.
3. **Laptop webcam:** use `getUserMedia` as `pumpCourt/src/camera.ts` already does.
   **Phone camera:** subscribe to the phone frames instead and draw each one:

   ```ts
   backend.subscribePhoneFrames(async (jpeg) => {
     const bitmap = await createImageBitmap(new Blob([jpeg], { type: "image/jpeg" }));
     const result = landmarker.detectForVideo(bitmap, performance.now());
     backend.pushPoseFrame({ width: bitmap.width, height: bitmap.height, landmarks: result.landmarks[0] ?? null });
   });
   ```

Good places for this code: a hook in `frontend/src/logic/` (e.g.
`useTracker.ts`) started by `App.tsx`, with `pumpCourt/src/landmarker.ts` and
`camera.ts` moved under `frontend/src/tracker/`. The MediaPipe wasm and model
files go in `frontend/public/` as they do in `pumpCourt/public/`.

## If the tracker already judges reps

The referees live in `backend/src/judge/`. If the tracker produces its own
angles or rep calls, `Session` in `backend/src/game/session.rs` is the place to
consume them instead.
