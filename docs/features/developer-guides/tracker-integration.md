# External Motion Tracker Integration Architecture

> **Module**: `backend/src/pose/` and `pumpCourt/src/`  
> **Key Types**: `PoseSource`, `PoseEstimator`, `PushedPoseFrame`  
> **Related Documents**: [Pose Tracking Overview](../pose-tracking/README.md), [Architecture](../../ARCHITECTURE.md)  
> **Maintenance Status**: Active / Hardware & CV Integration  

---

## 1. Overview & Integration Boundaries

The Pump-Court engine is designed to be completely independent of the underlying computer vision library. The downstream judging pipeline (angles, 3 referee lights, session timers, and leaderboard) only requires a stream of 33 normalized MediaPipe landmarks.

There are two primary architectural routes for integrating motion tracking:

```text
               ┌────────────────────────────────────────────────────────┐
               │         CAMERA FEED (Webcam, USB, Phone)               │
               └───────────┬────────────────────────────────┬───────────┘
                           │                                │
                 ROUTE A   │                                │ ROUTE B
           (Frontend WASM) │                                │ (Native C++ / FFI)
                           ▼                                ▼
               ┌───────────────────────┐        ┌───────────────────────┐
               │ MediaPipe JS / WASM   │        │ Native MediaPipe C++  │
               │ (runs in browser)     │        │ (runs in Rust backend)│
               └───────────┬───────────┘        └───────────┬───────────┘
                           │                                │
            pushPoseFrame  │                                │ PoseSource::next_frame
            (Tauri IPC)    │                                │
                           ▼                                ▼
               ┌────────────────────────────────────────────────────────┐
               │                 BACKEND JUDGE ENGINE                   │
               │        (angles ➔ ready check ➔ rep tracker)            │
               └────────────────────────────────────────────────────────┘
```

---

## 2. Route A: Frontend JavaScript / WASM Tracker

In Route A, MediaPipe runs inside the Webview via `@mediapipe/tasks-vision`.

### Steps to Implement:
1. Initialize the pushed source once on app boot:
   ```typescript
   await backend.startSource({ kind: 'pushed' });
   ```
2. On every animation frame, run inference and dispatch the landmarks via IPC:
   ```typescript
   const result = landmarker.detectForVideo(videoElement, performance.now());
   await backend.pushPoseFrame({
     width: videoElement.videoWidth,
     height: videoElement.videoHeight,
     landmarks: result.landmarks[0] ?? null,
   });
   ```
3. **Phone Camera Frames**:
   Subscribe to JPEG frames streamed from the phone over `backend.subscribePhoneFrames(cb)`, decode into an `ImageBitmap`, and feed to `detectForVideo()`.

---

## 3. Route B: Native Backend / C++ Tracker

In Route B, MediaPipe or an ONNX/TensorRT model runs compiled natively into the backend binary.

### Steps to Implement:
1. Implement the `PoseSource` trait in `backend/src/pose/`:
   ```rust
   pub struct NativeTrackerSource { /* camera handle, model pointer */ }

   impl PoseSource for NativeTrackerSource {
       fn next_frame(&mut self) -> Result<PoseFrame, String> {
           // Grab camera buffer, run native inference, return PoseFrame
       }
   }
   ```
2. Register the source in `open_source()` (`backend/src/pose/sources.rs`).
3. In `backend/build.rs`, link the native shared/static library using:
   ```rust
   println!("cargo:rustc-link-lib=mediapipe_c");
   println!("cargo:rustc-link-search=/path/to/lib");
   ```
4. Wrap unsafe C foreign function interface (FFI) bindings in a safe Rust RAII wrapper struct that implements `Drop`.
