# Pump-Court System Architecture

> **Audience**: Systems Engineers, Architects, and AI Coding Agents  
> **Status**: Verified Active Architecture  

---

## 1. High-Level Architecture Overview

Pump-Court is structured as a **hybrid desktop-distributed application**. It unites an ultra-low-latency backend pipeline written in Rust with a dynamic, dual-window user interface rendered in React / TypeScript via Tauri 2.

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SENSORS & INPUTS                              │
│                                                                                 │
│  [ Laptop / USB Webcam ]                [ Mobile Phone over Local Wi-Fi ]       │
│           │                                              │                      │
│           │ (getUserMedia)                               │ (HTTPS + WSS Binary) │
│           ▼                                              ▼                      │
│   Frontend MediaPipe /                  Axum Local HTTPS Server (:47800)        │
│   Native Video Capture                                   │ (JPEG Frames)        │
│           │                                              ▼                      │
│           │ (pushed frames via IPC)                  PhoneHub                   │
│           │                                         /        \                  │
│           │                  PhoneSource (Rust FFI)          Frontend Preview   │
└───────────┼────────────────────────────┬─────────────────────────┼──────────────┘
            │                            │                         │
            ▼                            ▼                         │
┌────────────────────────────────────────────────────────┐         │
│               RUST BACKEND CORE ENGINE                 │         │
│                                                        │         │
│   ┌────────────────────────────────────────────────┐   │         │
│   │ PoseSource Trait (Mock / Pushed / PhoneSource) │   │         │
│   └───────────────────────┬────────────────────────┘   │         │
│                           │ PoseFrame (landmarks, dims)│         │
│                           ▼                            │         │
│   ┌────────────────────────────────────────────────┐   │         │
│   │ Session State Machine                          │   │         │
│   │   ├── Ready Check (framing, FPS, plank hold)   │   │         │
│   │   ├── Angles & Biomechanics (elbow, hip, knee) │   │         │
│   │   └── RepTracker (3 Referees: Depth/Lock/Plank)│   │         │
│   └───────────────┬────────────────┬───────────────┘   │         │
│                   │                │                   │         │
│       RepVerdict  │                │ RoundResult       │         │
│                   ▼                ▼                   │         │
│             App Events       Leaderboard (SQLite)      │         │
│          ("rep", "tick")           │                   │         │
│                   │          Hourly Backups            │         │
└───────────────────┼────────────────┼───────────────────┘         │
                    │                │                             │
    IPC Event Stream│                │ Database Queries            │
    (Tauri Emitter) │                │ (Tauri Commands)            │
                    ▼                ▼                             │
┌────────────────────────────────────────────────────────┐         │
│                FRONTEND PRESENTATION LAYER             │         │
│                                                        │         │
│   ┌────────────────────────────────────────────────┐   │         │
│   │ Logic Layer (React Hooks: useRound, etc.)      │◀──┼─────────┘
│   └───────────────┬────────────────────────────────┘   │
│                   │ UI State & Callbacks               │
│                   ▼                                    │
│   ┌────────────────────────────────────────────────┐   │
│   │ Primary Screen (Operator Console)              │   │
│   │   ├── Video & Skeleton (PoseView Canvas)       │   │
│   │   ├── Referee Lights & Reason Alerts           │   │
│   │   └── Match Management Controls                │   │
│   └────────────────────────────────────────────────┘   │
│                   │ CrowdView Broadcast                │
│                   ▼                                    │
│   ┌────────────────────────────────────────────────┐   │
│   │ Secondary Screen (Crowd Stadium View #/crowd)  │   │
│   │   ├── Fullscreen Scoreboard & Leaderboards     │   │
│   │   ├── Live Rep Telemetry & Lights              │   │
│   │   └── Recent Runs Carousel                     │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Subsystems and Responsibility Boundaries

### 2.1 The Engine Thread (`backend/src/engine.rs`)
- **Isolation**: Runs on a dedicated background thread spawned via `std::thread::Builder::new().name("pump-court-engine")`.
- **Decoupling**: Never shares synchronous execution with the Tauri UI or Tokio runtime. If the UI lags or redraws, the 30–60Hz motion pipeline is completely unaffected.
- **Message Loop**: Interacts with Tauri commands strictly through an asynchronous bounded channel (`std::sync::mpsc::Receiver<EngineCommand>`).
- **Tick Dispatch**: Evaluates biomechanics and emits a `tick` event containing body angles, normalized coordinates, smoothed FPS, base64 JPEG preview (capped at ~15 Hz), and current session snapshot.

### 2.2 The Referee Pipeline (`backend/src/judge/`)
- **Functional & Deterministic**: The judging calculations (`angles.rs`, `tracker.rs`, `ready.rs`) contain zero I/O, zero network dependencies, and zero GUI state.
- **Three-Light Standard**:
  1. **Depth**: Measures minimum elbow flexion during the rep descent phase (default `<= 90°`).
  2. **Lockout**: Measures elbow extension on ascent, calibrated dynamically to athlete's starting anatomy (default `>= 160°`).
  3. **Plank**: Measures hip angle (shoulder-hip-ankle) and knee angle (hip-knee-ankle) to ensure full body tension throughout the movement (default `>= 160°`).
- **Anti-Cheat Hysteresis**:
  - Requires `confirm_frames` (default 2 consecutive frames) at top and bottom reversal points to eliminate sensor noise / frame drops.
  - Requires ascent margin (`25°`) before acknowledging the push-up ascent.
  - Detects "redip" cheats (`20°` elbow drop after ascent before achieving lockout) and flags lockout failure.

### 2.3 The Phone Camera Bridge (`backend/src/phone/`)
- **Zero-Install Client**: Any iOS or Android device connects through its native browser.
- **Embedded Web Server**: Spawns an internal Axum HTTPS daemon on port `47800` using an ephemeral in-memory self-signed certificate.
- **Binary JPEG WebSocket**: Ingests up to 30 frames per second of raw JPEG streams over `wss://<laptop-ip>:47800/ws?code=<pairing-code>`.
- **Fan-Out Architecture**: `PhoneHub` dispatches frames both to native Rust consumers (`PhoneSource`) and browser subscribers via Tauri IPC (`subscribe_phone_frames`).

### 2.4 Persistence Layer (`backend/src/leaderboard.rs`)
- **Storage Engine**: Embedded SQLite database via `rusqlite` bundled statically with the binary.
- **Data Integrity**: Enforces strict transactions, schema migrations on startup, and hourly JSON file exports to prevent data loss during long tournament days.
- **Validation**: Enforces 12-character display name limits, Unicode whitespace normalization, and a profane keyword blocklist.

### 2.5 Dual-Window Frontend (`frontend/src/`)
- **Tauri IPC Contract**: Defined in `frontend/src/api/backend.ts` and mirrored strictly with Rust structs in `frontend/src/api/types.ts`.
- **Presentation / Logic Decoupling**: Visual components in `frontend/src/ui/` do not call Tauri backend commands directly; they consume state through modular React hooks in `frontend/src/logic/`.
- **Dual Display Model**:
  - Window 1 (`/`): The Operator Control Station.
  - Window 2 (`#/crowd`): The Crowd Stadium Projector. Synchronized in real time via backend `CrowdView` state broadcasts.

---

## 3. Data Contracts & IPC Message Specification

### 3.1 Backend Events (Rust ➔ React)
Events are broadcast to all open Tauri windows using `app.emit(event, payload)`:

| Event Name | Frequency | Payload Type | Description |
| :--- | :--- | :--- | :--- |
| `tick` | Per video frame (~30–60Hz) | `Tick` | Coordinates, smoothed angles, FPS, session state, optional base64 JPEG |
| `rep` | On rep completion | `RepVerdict` | Attempt index, pass/fail status, 3 lights, detailed fault messages |
| `round-finished` | Round conclusion | `RoundResult` | Final clean rep count, accuracy, duration, rank, fault breakdown |
| `phone-status` | On connection change | `PhoneStatus` | Client device name, stream resolution, frame rate, server state |
| `source-status` | On camera source change | `SourceStatus` | Camera running flag, active error message |

### 3.2 Key Tauri Commands (React ➔ Rust)
Commands are registered in `backend/src/lib.rs` and invoked through `invoke(command_name, args)`:

- `start_source(spec: SourceSpec)`: Selects between `mock`, `camera`, `pushed`, or `file`.
- `start_round(mode: RoundMode, player: String, is_team: bool)`: Initializes a competitive match.
- `cancel_round()`: Aborts an active round.
- `get_leaderboard(category: Category, include_team: bool, limit: u32)`: Queries top scores.
- `set_crowd_view(view: CrowdView)`: Switches the crowd display mode between leaderboards and recent rounds.
- `get_phone_link()`: Returns local Wi-Fi URL, pairing code, and SVG QR code string.
- `push_pose_frame(frame: PushedPoseFrame)`: Ingests client-side MediaPipe landmark detections.
