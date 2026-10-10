# Pump-Court Documentation Portal

> **Version**: 3.0  
> **Target Audience**: Software engineers, venue operators, and AI coding agents  
> **Last Verified**: 2026-10-10  

Pump-Court is a push-up contest judged by software. A side-on camera (laptop webcam, USB camera or a phone) films the player. A pose tracker and a three-light referee run in the app window. A small Rust backend keeps the round clock and the score, and saves results to a local SQLite leaderboard. A second window shows the crowd the live count and the all-time top 10.

---

## 🗺️ Documentation Directory Map

Each feature has its own folder with a `README.md` overview and deeper pages.

```text
docs/
├── README.md                            # 📍 You are here: portal & index
├── ARCHITECTURE.md                      # System architecture, data flow, IPC contract
├── AGENTS.md                            # AI agent operating manual & doc upkeep rules
├── FRONTEND.md                          # Short guide: swapping in a new design
├── INTEGRATION.md                       # Short guide: how the tracker is wired in
├── PHONE_CAMERA.md                      # Short guide: phone cameras
├── RUST_GUIDE.md                        # Rust for first-timers, using this backend
└── features/
    ├── pose-tracking/                   # Feature 1: Camera → MediaPipe → tracked side
    │   ├── README.md                    # TrackerProvider, landmarks, side tracker, frames
    │   └── mediapipe-integration.md     # Pose Landmarker setup, offline assets, GPU/CPU
    ├── referee-engine/                  # Feature 2: The three-light referee (TypeScript)
    │   ├── README.md                    # Depth / Torso / Lockout, fixed rules, RepReport
    │   ├── angles-and-biomechanics.md   # Angles, abdominal point, depth in arm lengths
    │   ├── rep-segmentation.md          # RepJudge phases and SEGMENT constants
    │   ├── ready-check-calibration.md   # Posture check (POSTURE) and the floor line
    │   └── browser-prototype-judge.md   # The standalone pumpCourt app: Hard rules, tests, log replay
    ├── game-engine/                     # Feature 3: Round clock & score (Rust)
    │   ├── README.md                    # Session phases, SessionSnapshot, RoundResult
    │   ├── game-modes.md                # Sprint, Marathon, Max, Duel
    │   ├── engine-thread-loop.md        # Engine thread, commands, 100 ms tick
    │   └── browser-prototype-modes.md   # The standalone pumpCourt app's modes and co-op (not used by the app)
    ├── phone-camera/                    # Feature 4: Phones as cameras
    │   ├── README.md                    # Overview: rooms, any network, same Wi-Fi (WebRTC), rotation
    │   ├── https-and-tls.md             # Self-signed HTTPS on :47800, address ranking
    │   ├── pairing-and-websocket.md     # Rooms, HTTP signalling, relay socket, IPC
    │   ├── internet-link.md             # "Phone · any network": Cloudflare quick tunnel
    │   ├── mobile-web-client.md         # The phone page: build, WebRTC and relay modes
    │   └── browser-prototype-pairing.md # How the prototype's pairing was ported to Rust
    ├── leaderboard/                     # Feature 5: SQLite storage
    │   ├── README.md                    # runs table, migration, API
    │   ├── events.md                    # Events: per-mode, per-role and team boards
    │   ├── scoring-and-ranking.md       # Best run per player, all-time board, ties
    │   ├── name-validation.md           # Length cap and blocklist
    │   └── backup-and-recovery.md       # Hourly JSON backups and recovery
    ├── frontend-ui/                     # Feature 6: React UI & crowd window
    │   ├── README.md                    # Layers, screens, two windows
    │   ├── state-and-hooks.md           # useGameFlow, useRound, useCrowd, …
    │   ├── crowd-display-sync.md        # The crowd window
    │   └── styling-and-tokens.md        # Sketchbook theme, tokens, camera view
    ├── venue-operations/                # Feature 7: Running an event
    │   ├── README.md                    # Physical layout, camera position, lighting
    │   ├── operator-runbook.md          # Checklist, match flow, keys
    │   └── troubleshooting.md           # Symptom → fix table
    └── developer-guides/                # Feature 8: Building and extending
        ├── README.md                    # Setup, launch scripts, tests
        ├── rust-backend-guide.md        # Backend layout, threads, Tauri IPC
        └── tracker-integration.md       # How the app uses pumpCourt/src (@tracker/*)
```

---

## 🧭 Fast Reading Paths

### For AI Coding Agents
1. Read [AGENTS.md](AGENTS.md) for the rules and the doc upkeep checklist.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) to see what runs in TypeScript and what runs in Rust.
3. Read the `features/<feature>/README.md` for the files you are changing.

### For Game Operators & Venue Staff
1. Read the [Operator Runbook](features/venue-operations/operator-runbook.md).
2. Read [Phone Camera](features/phone-camera/README.md) to pair a phone.
3. Keep the [Troubleshooting table](features/venue-operations/troubleshooting.md) open during the event.

### For Frontend & UI Developers
1. Read the [Frontend Overview](features/frontend-ui/README.md).
2. Read [State and Hooks](features/frontend-ui/state-and-hooks.md).
3. Read [Crowd Display](features/frontend-ui/crowd-display-sync.md).

### For Computer Vision & Algorithm Engineers
1. Read [Pose Tracking](features/pose-tracking/README.md).
2. Read [Angles & Biomechanics](features/referee-engine/angles-and-biomechanics.md).
3. Read [Rep Segmentation](features/referee-engine/rep-segmentation.md) and [Ready Check](features/referee-engine/ready-check-calibration.md).

---

## ⚡ System Snapshot

| Subsystem | Language / Framework | Main Source Location | Job |
| :--- | :--- | :--- | :--- |
| **Pose tracking** | TypeScript, MediaPipe (`@mediapipe/tasks-vision` 1.0.1) | `pumpCourt/src/{landmarker,pose,camera,draw}.ts`, `frontend/src/logic/tracker/TrackerProvider.tsx` | Camera → 33 landmarks → angles of the side nearest the camera |
| **Ready check** | TypeScript | `pumpCourt/src/posture.ts` | Is the player in the push-up position? Plants the floor line |
| **Referee** | TypeScript | `pumpCourt/src/judge.ts` | Splits motion into reps, gives Depth / Torso / Lockout lights |
| **Round clock & score** | Rust (`std::thread`, `mpsc`) | `backend/src/engine.rs`, `backend/src/game/` | Get ready → countdown → running → finished; counts valid push-ups |
| **Desktop shell** | Rust / Tauri 2 | `backend/src/lib.rs`, `commands.rs` | Windows, commands, camera permission on Linux |
| **Phone cameras** | Rust (axum, rustls, rcgen) + TypeScript | `backend/src/phone/`, `frontend/src/logic/tracker/` | HTTPS on :47800, pairing rooms, WebRTC signalling, JPEG relay, Cloudflare tunnel |
| **Leaderboard** | Rust / SQLite (`rusqlite`, bundled) | `backend/src/leaderboard.rs` | `runs(name, mode, reps, event/role/team)`, best run per player, event / role / team boards (`events.rs`), hourly JSON backups |
| **Frontend** | TypeScript / React 18 / Vite 5 | `frontend/src/` | Operator window and crowd window |
