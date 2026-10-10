# MediaPipe Pose Integration Specification

> **Module**: `pumpCourt/src/landmarker.ts`, `pumpCourt/src/pose.ts`  
> **Key Types**: `PoseLandmarker`, `NormalizedLandmark`, `PushedPoseFrame`  
> **Related Documents**: [Pose Tracking Overview](README.md), [Mock Athlete](mock-athlete.md)  
> **Maintenance Status**: Active Reference  

---

## 1. Architecture Overview

MediaPipe Pose Landmarker is deployed via `@mediapipe/tasks-vision`. Inference runs in the browser context leveraging WebAssembly (WASM) and WebGL/WebGPU acceleration when available, with automatic CPU fallback.

```text
[ Webcam / Video Element ]
           │
           ▼ (requestAnimationFrame / 30-60 FPS)
   PoseLandmarker.detectForVideo(videoElement, timestamp)
           │
           ▼ (33 Landmark Array)
   pose.ts: pickTrackedSide(landmarks)
           │
           ├── Local Canvas Rendering (draw.ts)
           └── IPC Bridge: backend.pushPoseFrame({ width, height, landmarks })
                   │
                   ▼ (Tauri IPC)
              Inbox.push() ──▶ PoseSource::next_frame() ──▶ Session Engine
```

---

## 2. Configuration Parameters

In `landmarker.ts`, the model is initialized with:
- **Model**: `pose_landmarker_full.task` (stored locally in `public/wasm/` to ensure 100% offline functionality).
- **Running Mode**: `RunningMode.VIDEO` (optimizes tracking using temporal temporal consistency between successive video frames).
- **NumPoses**: `1` (strict single-athlete isolation; ignores background spectators).
- **MinPoseDetectionConfidence**: `0.5`.
- **MinPosePresenceConfidence**: `0.5`.
- **MinTrackingConfidence**: `0.5`.

---

## 3. Side Selection Heuristic

A push-up must be performed side-on to the camera. The athlete can face either left or right. The engine dynamically detects which side faces the camera:

```typescript
// From pumpCourt/src/pose.ts
export function pickTrackedSide(landmarks: Landmark[]): 'left' | 'right' {
  const leftVis = (landmarks[11].visibility + landmarks[13].visibility + landmarks[23].visibility) / 3;
  const rightVis = (landmarks[12].visibility + landmarks[14].visibility + landmarks[24].visibility) / 3;
  return leftVis >= rightVis ? 'left' : 'right';
}
```

Once the dominant side is resolved:
- **Tracked Shoulder**: `11` (left) or `12` (right).
- **Tracked Elbow**: `13` (left) or `14` (right).
- **Tracked Wrist**: `15` (left) or `16` (right).
- **Tracked Hip**: `23` (left) or `24` (right).
- **Tracked Knee**: `25` (left) or `26` (right).
- **Tracked Ankle**: `27` (left) or `28` (right).

---

## 4. Offline Content-Security-Policy (CSP) Compliance

MediaPipe by default attempts to fetch WASM binaries from CDN and report telemetry to Google servers. In Pump-Court:
- All WASM binaries (`pose_landmarker.wasm`, `pose_landmarker.data`) are bundled locally under `public/wasm/`.
- Content-Security-Policy in `index.html` restricts network requests strictly to `self` and local network origins, blocking telemetry and guaranteeing privacy for athletes.
