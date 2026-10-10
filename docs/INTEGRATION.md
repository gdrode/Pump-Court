# Plugging in the motion tracker

The camera engine in `pumpCourt/` runs **MediaPipe Pose Landmarker in the
browser** (`@mediapipe/tasks-vision`). That fits the Tauri app well, because
the app's screens are a browser too. The backend accepts landmarks from either
side, so a tracker can plug in from the frontend (JavaScript) or the backend
(Rust/C++). Nothing after `backend/src/pose/` (angles, referees, rounds,
leaderboard) changes either way.

## The contract

Each frame, the backend needs:

| Field | Meaning |
| --- | --- |
| `width`, `height` | image size in pixels (angles are measured in pixels) |
| `landmarks` | the 33 MediaPipe landmarks `{ x, y, z, visibility }` in MediaPipe's order, `x`/`y` normalised 0..1, or `null` if nobody was found |

Run the landmarker with `numPoses: 1` in `VIDEO` mode.

## Route A: tracker in the frontend (the pumpCourt engine)

1. Select the pushed source once: `backend.startSource({ kind: "pushed" })`.
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

## Route B: tracker in the backend (native / C++)

* **Phone camera:** implement `PoseEstimator` (`backend/src/pose/mod.rs`): it
  gets one JPEG and returns the 33 landmarks. Swap `NoEstimator` for it in
  `open_source` (marked `TODO(tracker)`).
* **Its own camera:** implement `PoseSource` (one `next_frame()` that blocks
  until a frame is ready) and return it for `SourceSpec::Camera` / `File`.
* Link a C/C++ library from `backend/build.rs` with
  `cargo:rustc-link-lib` / `cargo:rustc-link-search`, declare its functions in
  an `extern "C" { … }` block, and wrap the raw pointer in a struct with `Drop`.

## If the tracker already judges reps

The referees live in `backend/src/judge/`. If the tracker produces its own
angles or rep calls, `Session` in `backend/src/game/session.rs` is the place to
consume them instead.
