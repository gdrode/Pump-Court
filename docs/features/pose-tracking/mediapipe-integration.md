# MediaPipe Pose Integration

> **Module**: `pumpCourt/src/landmarker.ts`, `frontend/scripts/setup-assets.mjs`, `frontend/src/logic/tracker/TrackerProvider.tsx`  
> **Key Types**: `PoseLandmarker`, `LoadedLandmarker`, `ModelVariant`, `Delegate`  
> **Related Documents**: [Pose Tracking Overview](README.md), [Tracker Integration](../developer-guides/tracker-integration.md)  
> **Maintenance Status**: Active Reference  

---

## 1. Summary

MediaPipe Pose Landmarker (`@mediapipe/tasks-vision` **1.0.1**, pinned in `frontend/package.json`) finds the body in each camera frame. It runs inside the app window as WebAssembly, on the GPU when it can and on the CPU otherwise. All its files are served from the app itself, so tracking works with Wi-Fi off.

```text
<video> (shared, see TrackerProvider)
   │ requestAnimationFrame, once per new camera frame
   │ rotation ≠ 0: drawn turned onto the frame canvas
   ▼
landmarker.detectForVideo(video or frame canvas, t)   t strictly increasing
   │ result.landmarks[0]  (33 points, or undefined)
   ▼
createSideTracker().update(pose, width/height)  ─▶  PoseAngles | null
   ├── drawOverlay(ctx, pose, side)                   skeleton on the canvas
   └── posture.update(t, angles) ─▶ subscribers       (useRound → RepJudge)
```

---

## 2. Model settings (`pumpCourt/src/landmarker.ts`)

| Setting | Value |
| :--- | :--- |
| Model | `pose_landmarker_full.task` (`MODEL = 'full'`). The most accurate model that keeps up with 30 fps on a laptop. `heavy` is possible but much slower. |
| Model path | `/models/pose_landmarker_full.task` |
| Wasm path | `/wasm` (`FilesetResolver.forVisionTasks('/wasm')`) |
| Running mode | `VIDEO` |
| `numPoses` | `1` |
| Delegate | `GPU` first; `CPU` if the GPU can't be created |

`getLandmarker(variant, cpuOnly)` caches one landmarker per variant and delegate, so it is never rebuilt inside the frame loop. While creating it, `make()` runs one detection on a blank 64×64 canvas: some GPUs create the delegate fine and then fail on the first frame, and this catches that while a CPU fallback is still possible.

`TrackerProvider` adds one more fallback: if detection throws 10 frames in a row on the GPU, it switches to `cpuOnly`. On the CPU it shows the error instead. The Camera screen shows which delegate is in use and the poses per second.

---

## 3. Offline files (`frontend/scripts/setup-assets.mjs`)

Runs after `npm install` and at the start of `npm run dev` and `npm run build`:

1. Copies `node_modules/@mediapipe/tasks-vision/wasm` to `frontend/public/wasm/`.
2. Makes sure `frontend/public/models/pose_landmarker_full.task` exists: copied from `pumpCourt/public/models/` if the teammate's folder has it, otherwise downloaded once from `storage.googleapis.com`. If the download fails it prints the URL to fetch by hand.

Both folders are in `.gitignore`. After this step the app makes no outside request for tracking.

---

## 4. Path alias and one copy of MediaPipe

The frontend imports the tracker as `@tracker/landmarker`. `pumpCourt/` has no `node_modules` of its own inside the app build, so:

- `frontend/vite.config.ts`: `resolve.alias { "@tracker": "../pumpCourt/src" }`, `resolve.dedupe: ["@mediapipe/tasks-vision"]`, and `server.fs.allow` includes the tracker folder.
- `frontend/tsconfig.json`: `paths` maps `@tracker/*` to `../pumpCourt/src/*` and `@mediapipe/tasks-vision` to the frontend's copy.

---

## 5. Camera access (`pumpCourt/src/camera.ts`)

- `openCamera(deviceId)` asks `getUserMedia` for video only, ideal 1280×720 at 30 fps (`REQUESTED_FPS`).
- `listCameras()` lists `videoinput` devices. Labels appear only after the camera has been allowed once, so the list is re-read after opening a camera and on `devicechange`.
- On Linux the web view keeps the camera off by default; `allow_camera` in `backend/src/lib.rs` turns it on.
