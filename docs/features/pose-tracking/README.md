# Feature 01: Pose Tracking & Ingestion Pipeline

> **Module**: `backend/src/pose/` and `pumpCourt/src/`  
> **Key Types**: `PoseSource`, `PoseFrame`, `Landmark`, `SourceSpec`, `Inbox`  
> **Related Documents**: [MediaPipe Integration](mediapipe-integration.md), [Mock Athlete](mock-athlete.md), [Integration Guide](../developer-guides/tracker-integration.md)  
> **Maintenance Status**: Active / Pluggable Interface  

---

## 1. Executive Summary

The **Pose Tracking Pipeline** is responsible for transforming raw video feeds (from laptop webcams, external USB capture cards, or wireless phone cameras) into normalized 3D anatomical skeletal landmarks. 

To ensure maximum flexibility and enable seamless development without physical hardware, the backend abstracts all input feeds behind the `PoseSource` trait. Landmarks can be generated via client-side MediaPipe WASM, native C++ pipelines, or an internal synthetic "mock athlete".

---

## 2. Anatomical Landmark Contract

The system standardizes on the **MediaPipe Pose 33-landmark schema**. Every landmark is represented in normalized viewport coordinates:

```rust
pub struct Landmark {
    pub x: f32,          // Normalised 0.0 (left) to 1.0 (right)
    pub y: f32,          // Normalised 0.0 (top) to 1.0 (bottom)
    pub z: f32,          // Relative depth estimate (camera relative)
    pub visibility: f32, // Model confidence 0.0 to 1.0
}
```

### Key Landmark Indices Used for Push-Ups
For side-on push-up judging, the engine evaluates either the left or right side of the body based on visibility confidence:

| Landmark Point | Left Side Index | Right Side Index | Role in Biomechanical Evaluation |
| :--- | :--- | :--- | :--- |
| **Nose / Eye** | `0` (Nose), `2` (Eye) | `0` (Nose), `5` (Eye) | Head alignment, gaze direction |
| **Shoulder** | `11` | `12` | Upper body pivot; depth calculation; plank line |
| **Elbow** | `13` | `14` | Vertex for elbow flexion/extension (Depth & Lockout) |
| **Wrist** | `15` | `16` | Anchor point for elbow angle calculation |
| **Hip** | `23` | `24` | Core vertex for hip angle (Plank sag/pike detection) |
| **Knee** | `25` | `26` | Leg vertex for knee angle (Bent knee detection) |
| **Ankle** | `27` | `28` | Terminal anchor for body plank line |

```text
       (Shoulder) 11/12
           o──────────────o (Elbow) 13/14
          /                \
         /                  o (Wrist) 15/16 [Ground]
        o (Hip) 23/24
        │
        o (Knee) 25/26
        │
        o (Ankle) 27/28 [Ground]
```

---

## 3. The `PoseSource` Trait Abstraction

Located in `backend/src/pose/mod.rs`, the core contract is:

```rust
pub trait PoseSource: Send {
    /// Blocks until the next frame is ready.
    /// Returns Err only when the source stream has permanently halted.
    fn next_frame(&mut self) -> Result<PoseFrame, String>;
}
```

A `PoseFrame` contains:
```rust
pub struct PoseFrame {
    pub width: u32,
    pub height: u32,
    pub landmarks: Option<Vec<Landmark>>,
    pub preview_jpeg: Option<Vec<u8>>,
    pub timestamp_ms: i64,
}
```

---

## 4. Source Implementations

1. **`MockSource` (`mock.rs`)**:
   - Generates deterministic trigonometric pushes (clean reps, shallow reps, sagging planks, failed lockouts) at a fixed 30Hz rate.
   - Allows frontend and judging development on any headless machine.
2. **`PushedSource` (`inbox.rs`)**:
   - Ingests landmark vectors pushed from the frontend over Tauri IPC (`push_pose_frame`).
   - Uses a thread-safe `Inbox` with a condition variable (`Condvar`) to unblock the engine thread upon frame arrival.
3. **`PhoneSource` (`sources.rs`)**:
   - Consumes raw JPEG bytes from `PhoneHub` and hands them to a `PoseEstimator` for inference.
   - Employs a tracking-loss watchdog: if frames halt for more than `250ms`, `landmarks` defaults to `None`.

---

## 5. Tracking Loss & Void Conditions

In competitive play, athletes cannot be penalized for camera dropouts, and athletes cannot cheat by leaving the frame.
- **Micro-drop**: A missing frame is tolerated by the exponential moving average smoother.
- **Dropout Warning**: If no landmarks are detected for `> 250ms`, `tracking_ok` in `SessionSnapshot` flips to `false`.
- **Match Voiding**: If landmarks remain undetected for longer than `JudgeConfig.tracking_loss_ms` (default: `500ms`), the active competitive round is immediately voided with `voided: Some("Tracking lost")`.
